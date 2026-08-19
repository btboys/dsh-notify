import { Context, Service } from '@deepseek-ai/cordis'
import { appendFileSync } from 'fs'
import { NotificationAdapter } from './adapters/base.js'
import { SystemNotificationAdapter } from './adapters/system.js'
import { WebhookNotificationAdapter } from './adapters/webhook.js'
import { WeComNotificationAdapter } from './adapters/wecom.js'
import { WeChatClawBotAdapter, WeChatAdapterStatus } from './adapters/wechat.js'
import { ApiProxyLike, InteractionBridge } from './interaction.js'
import { TelegramNotificationAdapter } from './adapters/telegram.js'
import {
  NotifyEvent,
  NotifyEventType,
  NotifyPluginConfig,
  SystemNotifyConfig,
  TelegramNotifyConfig,
  WebhookNotifyConfig,
  WeChatNotifyConfig,
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
    wechat: { enabled: false, toUserIds: [], interactive: true, sessionFile: '', channelVersion: '1.0.2' },
    telegram: { enabled: false, botToken: '', chatId: '', parseMode: 'HTML', disableNotification: false, timeout: 5000, interactive: true },
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
  /** Whether session event listeners have been registered (at most once). */
  private listenersRegistered = false
  /** WeChat two-way interaction bridge; null when apiProxy is unavailable. */
  private bridge: InteractionBridge | null = null
  
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
   * Attach the host API gateway and start the WeChat interaction bridge.
   * Called by the plugin entry through `ctx.inject(['apiProxy'], …)` once the
   * gateway service is available; the bridge survives adapter rebuilds because
   * its hooks resolve the CURRENT wechat adapter on every call.
   */
  setApiProxy(apiProxy: ApiProxyLike): void {
    if (this.bridge) return
    const bridge = new InteractionBridge(this.ctx, apiProxy, {
      // Fan receipts out to every interactive channel; each push is
      // best-effort so one channel's failure never blocks the others.
      pushText: async (text) => {
        await Promise.all([
          this.getWechatAdapter()?.pushText(text),
          this.getTelegramAdapter()?.pushText(text),
        ])
      },
      // Approval/question prompts: Telegram gets inline-keyboard buttons,
      // WeChat gets the plain-text rendering; both happen here so the
      // bridge's text fallback (pushText) is not needed when any channel
      // was served.
      sendPrompt: async (entry) => {
        let claimed = false
        const tg = this.getTelegramAdapter()
        if (tg?.isInteractive()) {
          claimed = (await tg.sendPrompt(entry)) || claimed
        }
        const wx = this.getWechatAdapter()
        if (wx) {
          const text = entry.kind === 'approval'
            ? bridge.formatApprovalPush(entry)
            : bridge.formatQuestionPush(entry)
          await wx.pushText(text)
          claimed = true
        }
        return claimed
      },
      // Selection menus (/sessions, /workspace): Telegram gets inline-keyboard
      // buttons, WeChat gets the numbered text (its users reply /sel …).
      sendMenu: async (menu) => {
        let claimed = false
        const tg = this.getTelegramAdapter()
        if (tg?.isInteractive()) {
          claimed = (await tg.sendMenu(menu)) || claimed
        }
        const wx = this.getWechatAdapter()
        if (wx) {
          await wx.pushText(menu.text)
          claimed = true
        }
        return claimed
      },
      canInteract: (userId) =>
        (this.getWechatAdapter()?.canInteract(userId) ?? false)
        || (this.getTelegramAdapter()?.canInteract(userId) ?? false),
    })
    this.bridge = bridge
    this.syncInteraction()
    this.ctx.logger.info('[notify] Interaction bridge attached (apiProxy available)')
  }
  
  /** The current WeChat adapter, if the channel is initialized. */
  private getWechatAdapter(): WeChatClawBotAdapter | undefined {
    return this.adapters.find(
      (a): a is WeChatClawBotAdapter => a.name === 'wechat' && a instanceof WeChatClawBotAdapter,
    )
  }

  /** The current Telegram adapter, if the channel is initialized. */
  private getTelegramAdapter(): TelegramNotificationAdapter | undefined {
    return this.adapters.find(
      (a): a is TelegramNotificationAdapter => a.name === 'telegram' && a instanceof TelegramNotificationAdapter,
    )
  }
  
  /** Whether the WeChat channel is configured for two-way interaction. */
  private wechatInteractiveEnabled(): boolean {
    return this.config.enabled
      && this.config.channels.wechat?.enabled === true
      && this.config.channels.wechat?.interactive !== false
  }

  /** Whether the Telegram channel is configured for two-way interaction. */
  private telegramInteractiveEnabled(): boolean {
    return this.config.enabled
      && this.config.channels.telegram?.enabled === true
      && this.config.channels.telegram?.interactive !== false
  }

  /** Whether an adapter participates in interaction (its plain push of an answerable event would duplicate the bridge's prompt). */
  private isInteractiveAdapter(adapter: NotificationAdapter): boolean {
    if (adapter.name === 'wechat') return this.wechatInteractiveEnabled()
    if (adapter.name === 'telegram') return this.telegramInteractiveEnabled()
    return false
  }
  
  /**
   * Start/stop the interaction bridge and (de)wire the adapters' inbound
   * message hooks according to the live config. Called after every adapter
   * (re)build and config update.
   */
  private syncInteraction(): void {
    const wechat = this.getWechatAdapter()
    const telegram = this.getTelegramAdapter()
    const wechatInteractive = this.wechatInteractiveEnabled()
    const telegramInteractive = this.telegramInteractiveEnabled()
    
    if (wechat) {
      wechat.onUserMessage = wechatInteractive && this.bridge
        ? (userId, text) => { void this.bridge!.handleReply(userId, text) }
        : undefined
    }
    if (telegram) {
      telegram.onUserMessage = telegramInteractive && this.bridge
        ? (userId, text) => { void this.bridge!.handleReply(userId, text) }
        : undefined
    }
    
    if (this.bridge) {
      const anyInteractive = (wechatInteractive && wechat) || (telegramInteractive && telegram)
      if (anyInteractive) {
        this.bridge.start()
      } else {
        this.bridge.dispose()
      }
    }
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
    
    // Track the notified session so a free-text WeChat reply continues it.
    this.bridge?.noteNotification(event.metadata?.sessionId, event.metadata?.workspace)
    
    // Answerable events (approvals / questions) are pushed by the interaction
    // bridge WITH reply affordances; sending the plain notification to the
    // same interactive channels would duplicate it. Non-interactive channels
    // (system / webhook / wecom) still receive the plain notification.
    const bridgedEvent = this.bridge?.isActive === true
      && (event.type === 'authorizationRequired' || event.type === 'confirmationRequired')
    
    // Send to all enabled adapters
    const results = await Promise.allSettled(
      this.adapters.map((adapter) => {
        if (!adapter.enabled) {
          return Promise.resolve()
        }
        if (bridgedEvent && this.isInteractiveAdapter(adapter)) {
          this.ctx.logger.debug('[notify] Skipping plain %s push to %s (interaction bridge owns it)', event.type, adapter.name)
          return Promise.resolve()
        }
        this.ctx.logger.info('[notify] Sending via %s adapter', adapter.name)
        return adapter.send(event)
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
   * Current configuration
   */
  getConfig(): Required<NotifyPluginConfig> {
    return { ...this.config }
  }

  /**
   * Status of the WeChat ClawBot adapter (login state, QR payload, reachable
   * users) for the settings page. Returns `{ state: 'disabled', knownUsers: [] }`
   * when the channel is off or the adapter failed to initialize.
   */
  getWechatStatus(): WeChatAdapterStatus {
    const adapter = this.getWechatAdapter()
    if (!adapter) {
      return { state: 'disabled', knownUsers: [] }
    }
    return adapter.getStatus()
  }

  /**
   * Forget the persisted WeChat session and restart the QR login flow.
   * No-op when the channel is not enabled.
   */
  async reloginWechat(): Promise<WeChatAdapterStatus> {
    const adapter = this.getWechatAdapter()
    if (!adapter) {
      return { state: 'disabled', knownUsers: [] }
    }
    await adapter.relogin()
    return adapter.getStatus()
  }
  
  /**
   * Update configuration at runtime.
   *
   * Merges the patch into the current config and REBUILDS the adapter list so
   * channel enable/disable changes take effect immediately. Without the
   * rebuild, `send()` would keep dispatching to adapter instances created at
   * startup whose readonly `enabled` flag still reflects the old config — a
   * channel disabled in the settings page would keep receiving notifications
   * (and a channel enabled at runtime would never start working).
   */
  updateConfig(newConfig: Partial<NotifyPluginConfig>): void {
    this.config = this.mergeConfig(this.deepMerge(this.config, newConfig))
    
    if (this.config.enabled) {
      this.rebuildAdapters()
      // The plugin may have started disabled (no listeners registered); once
      // it becomes enabled at runtime the session listeners must be attached.
      if (!this.listenersRegistered) {
        this.registerEventListeners()
      }
    } else {
      // Plugin disabled at runtime: tear down all adapters so nothing sends.
      this.teardownAdapters()
    }
    this.syncInteraction()
    
    this.ctx.logger.info('[notify] Configuration updated')
  }
  
  /**
   * Field-wise deep merge of the `channels` and `events` groups so a partial
   * update (e.g. only `channels.wecom`) does not reset sibling channels to
   * defaults. Top-level scalars from the patch win.
   */
  private deepMerge(base: Required<NotifyPluginConfig>, patch: Partial<NotifyPluginConfig>): NotifyPluginConfig {
    const patchChannels = patch.channels || {}
    return {
      ...base,
      ...patch,
      channels: {
        system: { ...base.channels.system, ...(patchChannels.system as object | undefined) },
        webhook: { ...base.channels.webhook, ...(patchChannels.webhook as object | undefined) },
        wecom: { ...base.channels.wecom, ...(patchChannels.wecom as object | undefined) },
        wechat: { ...base.channels.wechat, ...(patchChannels.wechat as object | undefined) },
        telegram: { ...base.channels.telegram, ...(patchChannels.telegram as object | undefined) },
      } as NotifyPluginConfig['channels'],
      events: { ...base.events, ...(patch.events || {}) },
    }
  }
  
  /**
   * Dispose current adapters and rebuild them from the live config.
   */
  private rebuildAdapters(): void {
    this.teardownAdapters()
    this.initializeAdapters()
  }
  
  /**
   * Dispose and drop all current adapters (best-effort, errors are logged).
   */
  private teardownAdapters(): void {
    const previous = this.adapters
    this.adapters = []
    for (const adapter of previous) {
      if (!adapter.dispose) continue
      try {
        const result = adapter.dispose()
        if (result instanceof Promise) {
          result.catch((error) => {
            this.ctx.logger.error('[notify] Error disposing adapter %s:', adapter.name, error)
          })
        }
      } catch (error) {
        this.ctx.logger.error('[notify] Error disposing adapter %s:', adapter.name, error)
      }
    }
  }
  
  /**
   * Dispose all adapters
   */
  async dispose(): Promise<void> {
    this.ctx.logger.info('[notify] Disposing notification service')
    
    this.bridge?.dispose()
    this.teardownAdapters()
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
          interactive: (userChannels.telegram as any)?.interactive ?? defChannels.telegram!.interactive,
        },
        wechat: {
          enabled: (userChannels.wechat as any)?.enabled ?? defChannels.wechat!.enabled,
          toUserIds: (userChannels.wechat as any)?.toUserIds ?? defChannels.wechat!.toUserIds,
          interactive: (userChannels.wechat as any)?.interactive ?? defChannels.wechat!.interactive,
          sessionFile: (userChannels.wechat as any)?.sessionFile ?? defChannels.wechat!.sessionFile,
          channelVersion: (userChannels.wechat as any)?.channelVersion ?? defChannels.wechat!.channelVersion,
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
    
    // WeChat (ClawBot / iLink) notification adapter. Initialized whenever
    // enabled: a missing session is normal — the adapter runs the QR login
    // flow and reports progress through getWechatStatus().
    if (channels.wechat?.enabled) {
      try {
        const adapter = new WeChatClawBotAdapter(this.ctx, channels.wechat)
        this.adapters.push(adapter)
        this.ctx.logger.info('[notify] WeChat ClawBot notification adapter initialized')
      } catch (error) {
        this.ctx.logger.warn('[notify] Failed to initialize WeChat adapter:', error)
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
    // Guard against double registration (constructor + runtime re-enable).
    if (this.listenersRegistered) return
    this.listenersRegistered = true
    
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
    
    // Listen for confirmation events (authorization requests are handled above
    // via the session/event 'approval/asked' branch, which carries richer
    // context — do NOT also listen to the host 'approval/request' waterfall or
    // the notification fires twice).
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
      { questions: args?.questions, sessionId: session?.id, workspace }
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
      { toolName, reason, callId, sessionId: session?.id, workspace }
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
    
    // Last user message (the user's actual words). Host-injected context rides
    // user/message events too — <system-reminder>/<hindsight_*> XML blocks and
    // "Current runtime context" snapshots — and must never be shown as the
    // user's prompt. No length heuristic: short real messages ("好的") are
    // valid and must win over stale longer ones.
    let userPrompt = ''
    for (const e of turnEvents) {
      if (e?.type !== 'user/message') continue
      const text = this.extractText(e.data?.content)
      if (text && !this.isInjectedContext(text)) {
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
    
    // Truncate while preserving paragraph breaks: collapse whitespace runs
    // within a line but keep single newlines (3+ newlines fold into a blank
    // line). Chat pushes read far better with the reply's structure intact.
    const tidy = (s: string) => s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
    const truncate = (s: string, n: number) => s.length > n ? `${s.slice(0, n)}…` : s
    
    // Build the message
    const lines: string[] = []
    if (userPrompt) {
      lines.push(`💬 ${truncate(tidy(userPrompt), 200)}`)
    }
    if (reply) {
      lines.push(`🤖 ${truncate(tidy(reply), 500)}`)
    }
    // Tools / turn / duration / workspace stay in `details` (metadata) for
    // programmatic consumers; the human-facing message body is deliberately
    // slim — just 💬 user prompt and 🤖 AI reply.
    
    // Details for metadata
    const durationFromLog = (() => {
      if (typeof turnStartTime !== 'number') return undefined
      const lastEvent = turnEvents[turnEvents.length - 1]
      return lastEvent && typeof lastEvent.time === 'number' ? lastEvent.time - turnStartTime : undefined
    })()
    if (durationFromLog !== undefined) details.durationMs = durationFromLog
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
   * Whether a user/message text is host-injected context rather than the
   * user's own words: XML-ish injection blocks (`<system-reminder>`,
   * `<hindsight_knowledge>`, …) or the runtime-context snapshot header.
   */
  private isInjectedContext(text: string): boolean {
    const trimmed = text.trimStart()
    return trimmed.startsWith('<') || trimmed.startsWith('Current runtime context')
  }

  /**
   * Flatten message content blocks (text / reasoning / tool-call) into plain text.
   */
  /**
   * Flatten message content blocks into plain text. Only `text` blocks count —
   * `reasoning`/thinking blocks are the model's internal reasoning and must
   * never leak into notifications.
   */
  private extractText(content: any): string {
    if (typeof content === 'string') return content
    if (!Array.isArray(content)) return ''
    return content
      .filter((block: any) => block?.type === 'text')
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
