import { Context, Service } from '@deepseek-ai/cordis'
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
  titlePrefix: '[DSH]',
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
    // Listen for DSH session events
    // DSH uses session/event to dispatch all session lifecycle events
    
    this.ctx.on('session/event' as any, async (session: any, event: any) => {
      this.ctx.logger.debug('[notify] Session event received:', event?.type)
      
      // Handle turn/end events
      if (event?.type === 'turn/end') {
        const reason = event.data?.reason?.kind || 'unknown'
        const turn = event.data?.turn || 0
        
        this.ctx.logger.info('[notify] Turn ended:', { turn, reason })
        
        if (reason === 'completed' || reason === 'max-tokens') {
          await this.notifyConversationCompleted(
            '对话完成',
            `第 ${turn} 轮对话已完成`,
            { turn, reason }
          )
        } else if (reason === 'error') {
          await this.notifyConversationFailed(
            '对话失败',
            `第 ${turn} 轮对话失败`,
            { turn, reason, error: event.data?.reason?.error }
          )
        } else {
          // aborted / blocked / interrupted
          await this.notifyConversationPaused(
            '对话暂停',
            `第 ${turn} 轮对话已暂停 (${reason})`,
            { turn, reason }
          )
        }
      }
    })
    
    // Listen for approval/confirmation events
    this.ctx.on('approval/request' as any, async (data: any) => {
      this.ctx.logger.debug('[notify] Approval requested')
      await this.notifyAuthorizationRequired(
        '需要授权',
        data?.message || '操作需要您的授权',
        data
      )
    })
    
    this.ctx.on('confirm/request' as any, async (data: any) => {
      this.ctx.logger.debug('[notify] Confirmation requested')
      await this.notifyConfirmationRequired(
        '需要确认',
        data?.message || '操作需要您的确认',
        data
      )
    })
    
    this.ctx.logger.info('[notify] Event listeners registered')
  }
  
  /**
   * Check if a given event type should trigger notifications
   */
  private shouldNotify(eventType: NotifyEventType): boolean {
    return this.config.events[eventType] ?? false
  }
}

export default NotifyService
