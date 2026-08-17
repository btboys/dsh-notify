/**
 * zh/en dictionaries for the notify settings page (settings.section, nav
 * label "通知"/"Notify"). Keys are shared between the nav label and the page
 * controls; `nav` is the sidebar entry label.
 */

export const zh: Record<string, string> = {
  nav: '通知',
  loading: '加载中…',
  loadError: '无法加载通知配置',
  save: '保存',
  saving: '保存中…',
  discard: '放弃修改',
  saveFailed: '保存失败',

  pageHint: '在这里配置通知渠道与触发事件。修改后点击「保存」，配置会持久化并在下次启动时生效。',
  notifyTitle: '通知',
  enabled: '启用通知',
  enabledHint: '开关全局（关闭后不发任何通知）',

  channelsSystem: '系统通知',
  systemEnabled: '系统通知',
  systemEnabledHint: '发送桌面原生通知',
  systemSound: '提示音',
  systemSoundHint: '通知时播放提示音',
  systemSoundName: '提示音名称',
  systemSoundNameHint: 'macOS 声音名：Glass、Ping、Sosumi、Basso 等',

  channelsWebhook: 'Webhook',
  webhookEnabled: 'Webhook 通知',
  webhookEnabledHint: '向自定义 URL 发送 POST 请求',
  webhookUrl: 'Webhook URL',
  webhookUrlHint: '接收通知的 HTTP endpoint',

  channelsWecom: '企业微信',
  wecomEnabled: '企业微信机器人',
  wecomEnabledHint: '企业微信群机器人通知',
  wecomWebhookUrl: '企业微信 Webhook URL',
  wecomWebhookUrlHint: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…',
  wecomMsgType: '消息类型',

  channelsTelegram: 'Telegram',
  telegramEnabled: 'Telegram 机器人',
  telegramEnabledHint: 'Telegram 通知',
  telegramToken: 'Bot Token',
  telegramTokenHint: '从 @BotFather 获取的机器人 token',
  telegramChatId: 'Chat ID',
  telegramChatIdHint: '接收通知的用户或群组 ID',
  telegramParseMode: '解析模式',

  eventsTitle: '触发事件',
  conversationCompleted: '对话完成',
  conversationCompletedHint: '任务成功完成时提醒',
  conversationPaused: '对话暂停',
  conversationPausedHint: '被中断或等待输入时提醒',
  conversationFailed: '对话失败',
  conversationFailedHint: '遇到错误时提醒',
  authorizationRequired: '需要授权',
  authorizationRequiredHint: '请求沙箱权限提升时提醒',
  confirmationRequired: '需要回答',
  confirmationRequiredHint: 'Agent 向你提问时提醒',

  titlePrefix: '标题前缀',
  titlePrefixHint: '所有通知标题统一加的前缀，留空不加',
}

export const en: Record<string, string> = {
  nav: 'Notification',
  loading: 'Loading…',
  loadError: 'Failed to load notification config',
  save: 'Save',
  saving: 'Saving…',
  discard: 'Discard',
  saveFailed: 'Save failed',

  pageHint: 'Configure notification channels and trigger events. Changes take effect on Save and persist across restarts.',
  notifyTitle: 'Notifications',
  enabled: 'Enable notifications',
  enabledHint: 'Global switch (off disables every notification)',

  channelsSystem: 'System',
  systemEnabled: 'System notifications',
  systemEnabledHint: 'Send native desktop notifications',
  systemSound: 'Play sound',
  systemSoundHint: 'Play an alert sound with the notification',
  systemSoundName: 'Sound name',
  systemSoundNameHint: 'macOS sound: Glass, Ping, Sosumi, Basso, etc.',

  channelsWebhook: 'Webhook',
  webhookEnabled: 'Webhook',
  webhookEnabledHint: 'POST to a custom endpoint',
  webhookUrl: 'Webhook URL',
  webhookUrlHint: 'HTTP endpoint that receives notifications',

  channelsWecom: 'WeCom',
  wecomEnabled: 'WeCom bot',
  wecomEnabledHint: 'Enterprise WeChat group-bot notifications',
  wecomWebhookUrl: 'WeCom webhook URL',
  wecomWebhookUrlHint: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…',
  wecomMsgType: 'Message type',

  channelsTelegram: 'Telegram',
  telegramEnabled: 'Telegram bot',
  telegramEnabledHint: 'Telegram notifications',
  telegramToken: 'Bot token',
  telegramTokenHint: 'Bot token from @BotFather',
  telegramChatId: 'Chat ID',
  telegramChatIdHint: 'User or group ID that receives notifications',
  telegramParseMode: 'Parse mode',

  eventsTitle: 'Triggers',
  conversationCompleted: 'Conversation completed',
  conversationCompletedHint: 'Notify when a task succeeds',
  conversationPaused: 'Conversation paused',
  conversationPausedHint: 'Notify when interrupted or awaiting input',
  conversationFailed: 'Conversation failed',
  conversationFailedHint: 'Notify on errors',
  authorizationRequired: 'Authorization required',
  authorizationRequiredHint: 'Notify when sandbox permission escalation is requested',
  confirmationRequired: 'Question to answer',
  confirmationRequiredHint: 'Notify when the agent asks you something',

  titlePrefix: 'Title prefix',
  titlePrefixHint: 'Prefix added to every notification title; empty for none',
}
