import { Context, Service } from '@deepseek-ai/cordis'
import { appendFileSync } from 'fs'
import { NotificationAdapter } from './adapters/base.js'
import { SystemNotificationAdapter } from './adapters/system.js'
import { WebhookNotificationAdapter } from './adapters/webhook.js'
import { WeComNotificationAdapter } from './adapters/wecom.js'
import { TelegramNotificationAdapter } from './adapters/telegram.js'
import {
  NotifyEvent,
  NotifyEventType,
  NotifyPluginConfig,
  SystemNotifyConfig,
  TelegramNotifyConfig,
  WebhookNotifyConfig,
  WeComNotifyConfig,
} from './types.js'

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<NotifyPluginConfig> = {
  enabled: true,
  channels: {
    system: { enabled: true, sound: true, icon: undefined },
    webhook: { enabled: false, url: '', method: 'POST', timeout: 5000, headers: {} },
    wecom: { enabled: false, webhookUrl: '', mentions: [], msgType: 'markdown' },
    telegram: { enabled: false, botToken: '', chatId: '', parseMode: 'HTML', disableNotification: false, timeout: 5000 },
  },
  events: {
    conversationCompleted: true,
    conversationPaused: true,
    conversationFailed: true,
    authorizationRequired: true,
    confirmationRequired: true,
  },
  // Empty by default: no title prefix is added. Set e.g. "[DSH]" in config
  // to prepend a product label to every notification title.
  titlePrefix: '',
}

/**
 * Main notification service for DSH
 * 
 * Manages multiple notification adapters and dispatches events to enabled channels.
 */
export class NotifyService extends Service {
  private config: Required<NotifyPluginConfig>
  private adapters: NotificationAdapter[] = []
  
  constructor(ctx: Context, config?: NotifyPluginConfig) {
    super(ctx, 'notify')
    
    // Merge user config with defaults
    this.config = this.mergeConfig(config || {})
    
    // Initialize adapters if plugin is enabled
    if (this.config.enabled) {
      this.initializeAdapters()
      this.registerEventListeners()
    }
    
    // Mixin methods to context (using type assertion to bypass strict typing)
    ctx.mixin('notify', ['send', 'isEnabled'] as any)
  }
  
  /**
   * Check if the plugin is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled
  }
  
  /**
   * Send a notification through all enabled channels
   */
  async send(event: NotifyEvent): Promise<void> {
    if (!this.config.enabled) {
      this.ctx.logger.debug('[notify] Plugin is disabled, skipping notification')
      return
    }
    
    // Check if this event type should trigger notifications
    if (!this.shouldNotify(event.type)) {
      this.ctx.logger.debug('[notify] Event type %s is filtered out', event.type)
      return
    }
    
    // Ensure timestamp
    if (!event.timestamp) {
      event.timestamp = Date.now()
    }
    
    // Add title prefix
    if (this.config.titlePrefix && !event.title.startsWith(this.config.titlePrefix)) {
      event.title = `${this.config.titlePrefix} ${event.title}`
    }
    
    // Emit internal event
    this.ctx.emit(`notify/send`, event)
    this.ctx.emit(`notify/${event.type}`, event)
    
    // Send to all enabled adapters
    const results = await Promise.allSettled(
      this.adapters.map((adapter) => {
        if (adapter.enabled) {
          this.ctx.logger.info('[notify] Sending via %s adapter', adapter.name)
          return adapter.send(event)
        }
        return Promise.resolve()
      })
    )
    
    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const adapterName = this.adapters[index]?.name || 'unknown'
        this.ctx.logger.error('[notify] Adapter %s failed:', adapterName, result.reason)
      }
    })
  }
  
  /**
   * Convenience method: notify when conversation completes
   */
  async notifyConversationCompleted(title: string, message: string, metadata?: any) {
    await this.send({
      type: 'conversationCompleted',
      title,
      message,
      metadata,
    })
  }
  
  /**
   * Convenience method: notify when conversation pauses
   */
  async notifyConversationPaused(title: string, message: string, metadata?: any) {
    await this.send({
      type: 'conversationPaused',
      title,
      message,
      metadata,
    })
  }
  
  /**
   * Convenience method: notify when conversation fails
   */
  async notifyConversationFailed(title: string, message: string, metadata?: any) {
    await this.send({
      type: 'conversationFailed',
      title,
      message,
      metadata,
    })
  }
  
  /**
   * Convenience method: notify when authorization is required
   */
  async notifyAuthorizationRequired(title: string, message: string, metadata?: any) {
    await this.send({
      type: 'authorizationRequired',
      title,
      message,
      metadata,
    })
  }
  
  /**
   * Convenience method: notify when confirmation is required
   */
  async notifyConfirmationRequired(title: string, message: string, metadata?: any) {
    await this.send({
      type: 'confirmationRequired',
      title,
      message,
      metadata,
    })
  }
  
  /**
   * Get current configuration
   */
  getConfig(): Required<NotifyPluginConfig> {
    return { ...this.config }
  }
  
  /**
   * Update configuration at runtime
   */
  updateConfig(newConfig: Partial<NotifyPluginConfig>): void {
    this.config = this.mergeConfig({ ...this.config, ...newConfig })
    this.ctx.logger.info('[notify] Configuration updated')
  }
  
  /**
   * Dispose all adapters
   */
  async dispose(): Promise<void> {
    this.ctx.logger.info('[notify] Disposing notification service')
    
    await Promise.all(
      this.adapters.map(async (adapter) => {
        if (adapter.dispose) {
          try {
            await adapter.dispose()
          } catch (error) {
            this.ctx.logger.error('[notify] Error disposing adapter %s:', adapter.name, error)
          }
        }
      })
    )
    
    this.adapters = []
  }
  
  /**
   * Merge user configuration with defaults
   */
  private mergeConfig(userConfig: NotifyPluginConfig): Required<NotifyPluginConfig> {
    const defChannels = DEFAULT_CONFIG.channels
    
    // Use type assertions to simplify merging logic
    const userChannels = userConfig.channels || {}
    
    return {
      enabled: userConfig.enabled ?? DEFAULT_CONFIG.enabled,
      channels: {
        system: {
          enabled: (userChannels.system as any)?.enabled ?? defChannels.system!.enabled,
          sound: (userChannels.system as any)?.sound ?? defChannels.system!.sound,
          icon: (userChannels.system as any)?.icon ?? defChannels.system!.icon,
        },
        webhook: {
          enabled: (userChannels.webhook as any)?.enabled ?? defChannels.webhook!.enabled,
          url: (userChannels.webhook as any)?.url ?? defChannels.webhook!.url,
          method: (userChannels.webhook as any)?.method ?? defChannels.webhook!.method,
          timeout: (userChannels.webhook as any)?.timeout ?? defChannels.webhook!.timeout,
          headers: (userChannels.webhook as any)?.headers ?? defChannels.webhook!.headers,
        },
        wecom: {
          enabled: (userChannels.wecom as any)?.enabled ?? defChannels.wecom!.enabled,
          webhookUrl: (userChannels.wecom as any)?.webhookUrl ?? defChannels.wecom!.webhookUrl,
          mentions: (userChannels.wecom as any)?.mentions ?? defChannels.wecom!.mentions,
          msgType: (userChannels.wecom as any)?.msgType ?? defChannels.wecom!.msgType,
        },
        telegram: {
          enabled: (userChannels.telegram as any)?.enabled ?? defChannels.telegram!.enabled,
          botToken: (userChannels.telegram as any)?.botToken ?? defChannels.telegram!.botToken,
          chatId: (userChannels.telegram as any)?.chatId ?? defChannels.telegram!.chatId,
          parseMode: (userChannels.telegram as any)?.parseMode ?? defChannels.telegram!.parseMode,
          disableNotification: (userChannels.telegram as any)?.disableNotification ?? defChannels.telegram!.disableNotification,
          timeout: (userChannels.telegram as any)?.timeout ?? defChannels.telegram!.timeout,
        },
      },
      events: {
        ...DEFAULT_CONFIG.events,
        ...(userConfig.events || {}),
      },
      titlePrefix: userConfig.titlePrefix ?? DEFAULT_CONFIG.titlePrefix,
    }
  }
  
  /**
   * Initialize notification adapters based on configuration
   */
  private initializeAdapters(): void {
    const { channels } = this.config
    
    // System notification adapter
    if (channels.system?.enabled) {
      try {
        const adapter = new SystemNotificationAdapter(this.ctx, channels.system)
        this.adapters.push(adapter)
        this.ctx.logger.info('[notify] System notification adapter initialized')
      } catch (error) {
        this.ctx.logger.warn('[notify] Failed to initialize system adapter:', error)
      }
    }
    
    // Webhook notification adapter
    if (channels.webhook?.enabled && channels.webhook.url) {
      try {
        const adapter = new WebhookNotificationAdapter(this.ctx, channels.webhook)
        this.adapters.push(adapter)
        this.ctx.logger.info('[notify] Webhook notification adapter initialized')
      } catch (error) {
        this.ctx.logger.warn('[notify] Failed to initialize webhook adapter:', error)
      }
    }
    
    // WeCom notification adapter
    if (channels.wecom?.enabled && channels.wecom.webhookUrl) {
      try {
        const adapter = new WeComNotificationAdapter(this.ctx, channels.wecom)
        this.adapters.push(adapter)
        this.ctx.logger.info('[notify] WeCom notification adapter initialized')
      } catch (error) {
        this.ctx.logger.warn('[notify] Failed to initialize WeCom adapter:', error)
      }
    }
    
    // Telegram notification adapter
    if (channels.telegram?.enabled && channels.telegram.botToken && channels.telegram.chatId) {
      try {
        const adapter = new TelegramNotificationAdapter(this.ctx, channels.telegram)
        this.adapters.push(adapter)
        this.ctx.logger.info('[notify] Telegram notification adapter initialized')
      } catch (error) {
        this.ctx.logger.warn('[notify] Failed to initialize Telegram adapter:', error)
      }
    }
    
    if (this.adapters.length === 0) {
      this.ctx.logger.warn('[notify] No notification adapters enabled')
    } else {
      this.ctx.logger.info('[notify] Initialized %d notification adapter(s)', this.adapters.length)
    }
  }
  
  /**
   * Register event listeners for DSH lifecycle events
   */
  private registerEventListeners(): void {
    // Debug file for diagnosing event delivery in a running DSH
    const DEBUG_LOG = '/tmp/dsh-notify-debug.log'
    const debug = (msg: string, ...rest: any[]) => {
      try {
        appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${msg} ${rest.map(r => typeof r === 'string' ? r : JSON.stringify(r)).join(' ')}\n`)
      } catch { /* ignore */ }
    }
    
    debug('registerEventListeners called, enabled=', this.config.enabled)
    
    // Listen for DSH session events
    // DSH uses session/event to dispatch all session lifecycle events
    // Listener signature: (session, event)
    
    this.ctx.on('session/event' as any, async (session: any, event: any) => {
      debug('session/event received, type=', event?.type)
      this.ctx.logger.debug('[notify] Session event received:', event?.type)
      
      // Handle tool/call events — the model pausing to ask the user, request
      // confirmation, or request authorization surfaces as a tool call.
      if (event?.type === 'tool/call') {
        const name = event.data?.name || ''
        // "ask_user_question" requires the human to answer before continuing.
        if (name === 'ask_user_question') {
          await this.handleUserQuestion(session, event)
        }
        return
      }
      
      // Handle approval/asked events — the model is requesting authorization
      // to perform a sensitive operation.
      if (event?.type === 'approval/asked') {
        await this.handleApprovalRequest(session, event)
        return
      }
      
      // Handle turn/end events
      if (event?.type === 'turn/end') {
        const reason = event.data?.reason?.kind || 'unknown'
        const turn = event.data?.turn || 0
        
        this.ctx.logger.info('[notify] Turn ended:', { turn, reason })
        
        // Extract a rich summary of this turn from the session log
        const summary = this.extractTurnSummary(session, turn)
        
        // Title: "✅ [workspace] 对话完成" — icon first, workspace when known,
        // then the state label; without a workspace it becomes "✅ 对话完成".
        const ws = summary.details.workspace
        const title = (icon: string, label: string) => ws
          ? `${icon} [${ws}] ${label}`
          : `${icon} ${label}`
        
        if (reason === 'completed' || reason === 'max-tokens') {
          debug('notifying conversation completed')
          await this.notifyConversationCompleted(
            title('✅', '对话完成'),
            summary.message,
            { turn, reason, ...summary.details }
          )
        } else if (reason === 'error') {
          debug('notifying conversation failed')
          await this.notifyConversationFailed(
            title('❌', '对话失败'),
            `${summary.message}\n错误: ${this.extractErrorMessage(event.data?.reason?.error)}`,
            { turn, reason, ...summary.details, error: event.data?.reason?.error }
          )
        } else {
          // aborted / blocked / interrupted
          debug('notifying conversation paused')
          await this.notifyConversationPaused(
            title('⏸️', '对话暂停'),
            `${summary.message}\n原因: ${reason}`,
            { turn, reason, ...summary.details }
          )
        }
      }
    })
    
    // Listen for approval/confirmation events
    this.ctx.on('approval/request' as any, async (data: any) => {
      debug('approval/request received')
      this.ctx.logger.debug('[notify] Approval requested')
      await this.notifyAuthorizationRequired(
        '需要授权',
        data?.message || '操作需要您的授权',
        data
      )
    })
    
    this.ctx.on('confirm/request' as any, async (data: any) => {
      debug('confirm/request received')
      this.ctx.logger.debug('[notify] Confirmation requested')
      await this.notifyConfirmationRequired(
        '需要确认',
        data?.message || '操作需要您的确认',
        data
      )
    })
    
    debug('event listeners registered')
  }
  
  /**
   * Handle an `ask_user_question` tool call: the model paused the turn and is
   * waiting for the human to answer a question. Emits a "需要确认" notification
   * with the question text, options, and workspace context.
   * @param session - the Session instance.
   * @param event - the tool/call event.
   */
  private async handleUserQuestion(session: any, event: any): Promise<void> {
    this.ctx.logger.debug('[notify] ask_user_question tool call received')
    
    // Parse the question payload from tool arguments.
    const args = this.parseToolArguments(event.data?.arguments)
    const questions: Array<{ question?: string; header?: string; options?: Array<{ label?: string }> }> =
      Array.isArray(args?.questions) ? args.questions : []
    
    const first = questions[0]
    const questionText = first?.question || '请回答以下问题'
    const header = first?.header
    const options = (first?.options || []).map((o: { label?: string }) => o.label).filter(Boolean).join(' / ')
    
    // Build a rich message with workspace context.
    const lines: string[] = []
    if (header) lines.push(`📌 ${header}`)
    lines.push(`❓ ${questionText}`)
    if (options) lines.push(`🔘 选项: ${options}`)
    
    // Workspace context for the title.
    const cwd: string | undefined = session?.header?.cwd
    const workspace = cwd ? cwd.split('/').filter(Boolean).pop() || cwd : undefined
    
    await this.notifyConfirmationRequired(
      workspace ? `❓ [${workspace}] 需要回答` : '❓ 需要回答',
      lines.join('\n'),
      { questions: args?.questions }
    )
    this.ctx.logger.debug('[notify] user question notification sent')
  }
  
  /**
   * Best-effort parse of a tool call's `arguments` JSON string.
   */
  private parseToolArguments(raw: any): any {
    if (typeof raw !== 'string' || !raw) return {}
    try {
      return JSON.parse(raw)
    } catch {
      return {}
    }
  }
  
  /**
   * Handle an `approval/asked` session event: the model is requesting
   * authorization to perform a sensitive operation. Emits a "需要授权"
   * notification with the tool name, reason, and workspace context.
   * @param session - the Session instance.
   * @param event - the approval/asked event.
   */
  private async handleApprovalRequest(session: any, event: any): Promise<void> {
    this.ctx.logger.debug('[notify] approval/asked event received')
    
    const toolName = event.data?.toolName || '未知操作'
    const reason = event.data?.reason || '需要您的授权才能继续'
    const callId = event.data?.callId
    
    // Workspace context for the title.
    const cwd: string | undefined = session?.header?.cwd
    const workspace = cwd ? cwd.split('/').filter(Boolean).pop() || cwd : undefined
    
    // Build a rich message.
    const lines: string[] = []
    lines.push(`🔐 操作: ${toolName}`)
    if (reason) lines.push(`📝 原因: ${reason}`)
    if (callId) lines.push(`🆔 ${callId}`)
    
    await this.notifyAuthorizationRequired(
      workspace ? `🔐 [${workspace}] 需要授权` : '🔐 需要授权',
      lines.join('\n'),
      { toolName, reason, callId }
    )
    this.ctx.logger.debug('[notify] approval request notification sent')
  }
  
  /**
   * Check if a given event type should trigger notifications
   */
  private shouldNotify(eventType: NotifyEventType): boolean {
    return this.config.events[eventType] ?? false
  }
  
  /**
   * Build a rich human-readable summary of a turn from the session log:
   * the user's last question, the assistant's reply excerpt, the tools used,
   * the conversation title, and the workspace.
   * @param session - the Session instance passed to the session/event listener.
   * @param turn - the turn number that just ended.
   * @returns a display message plus structured details for metadata.
   */
  private extractTurnSummary(session: any, turn: number): {
    message: string
    details: { userPrompt?: string; reply?: string; tools?: string[]; steps?: number; durationMs?: number; title?: string; workspace?: string; sessionId?: string }
  } {
    const details: { userPrompt?: string; reply?: string; tools?: string[]; steps?: number; durationMs?: number; title?: string; workspace?: string; sessionId?: string } = {}
    const log: any[] = Array.isArray(session?.log) ? session.log : []
    
    // Filter events belonging to this turn (and tolerate turn-less logs)
    const turnEvents = log.filter(e => e?.type === 'turn/start' || e?.data?.turn === turn || e?.data?.turn === undefined)
    
    // Last user message (find the user's actual question, skipping system prompts)
    let userPrompt = ''
    for (const e of turnEvents) {
      if (e?.type !== 'user/message') continue
      const text = this.extractText(e.data?.content)
      if (text && text.length > 20 && !text.startsWith('<system-reminder>')) {
        userPrompt = text
      }
    }
    
    // Last assistant message
    let reply = ''
    for (const e of turnEvents) {
      if (e?.type !== 'assistant/message') continue
      const text = this.extractText(e.data?.message?.content)
      if (text) reply = text
    }
    
    // Tools used (unique names, with counts)
    const toolCounts = new Map<string, number>()
    let steps = 0
    let turnStartTime: number | undefined
    for (const e of turnEvents) {
      if (e?.type === 'tool/call' && e.data?.name) {
        toolCounts.set(e.data.name, (toolCounts.get(e.data.name) ?? 0) + 1)
      }
      if (e?.type === 'step/start') steps++
      if (e?.type === 'turn/start' && typeof e.time === 'number') turnStartTime = e.time
    }
    
    const tools = [...toolCounts.entries()]
      .map(([name, count]) => count > 1 ? `${name}×${count}` : name)
    
    // Conversation title: from the latest session/title event
    let title = ''
    for (const e of log) {
      if (e?.type === 'session/title' && e.data?.title) title = e.data.title
    }
    
    // Workspace: basename of the session's cwd
    const cwd: string | undefined = session?.header?.cwd
    const workspace = cwd
      ? cwd.split('/').filter(Boolean).pop() || cwd
      : undefined
    
    const truncate = (s: string, n: number) => s.length > n ? `${s.slice(0, n)}…` : s
    
    // Build the message
    const lines: string[] = []
    if (userPrompt) {
      lines.push(`💬 ${truncate(userPrompt.replace(/\s+/g, ' ').trim(), 60)}`)
    }
    if (reply) {
      lines.push(`🤖 ${truncate(reply.replace(/\s+/g, ' ').trim(), 80)}`)
    }
    if (tools.length > 0) {
      lines.push(`🔧 工具: ${tools.join(', ')}`)
    }
    const meta: string[] = [`第 ${turn} 轮`]
    if (steps > 0) meta.push(`${steps} 步`)
    if (typeof turnStartTime === 'number') {
      const lastEvent = turnEvents[turnEvents.length - 1]
      if (lastEvent && typeof lastEvent.time === 'number') {
        details.durationMs = lastEvent.time - turnStartTime
        const secs = Math.round(details.durationMs / 1000)
        meta.push(secs >= 60 ? `${Math.floor(secs / 60)}m${secs % 60}s` : `${secs}s`)
      }
    }
    if (title) {
      meta.push(`📝 ${truncate(title, 24)}`)
    }
    if (workspace) {
      meta.push(`📁 ${workspace}`)
    }
    lines.push(`📊 ${meta.join(' · ')}`)
    
    // Details for metadata
    if (userPrompt) details.userPrompt = userPrompt
    if (reply) details.reply = reply
    if (tools.length > 0) details.tools = tools
    if (steps > 0) details.steps = steps
    if (title) details.title = title
    if (workspace) details.workspace = workspace
    if (session?.id) details.sessionId = session.id
    
    return { message: lines.join('\n'), details }
  }
  
  /**
   * Flatten message content blocks (text / reasoning / tool-call) into plain text.
   */
  private extractText(content: any): string {
    if (typeof content === 'string') return content
    if (!Array.isArray(content)) return ''
    return content
      .filter((block: any) => block?.type === 'text' || block?.type === 'reasoning')
      .map((block: any) => block.text ?? '')
      .join(' ')
      .trim()
  }
  
  /**
   * Extract a readable error message from a turn/end error reason.
   */
  private extractErrorMessage(error: any): string {
    if (typeof error === 'string') return error
    if (error?.message) return String(error.message)
    if (error?.code) return String(error.code)
    try {
      return JSON.stringify(error)
    } catch {
      return '未知错误'
    }
  }
}

export default NotifyService
