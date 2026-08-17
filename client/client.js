window.__ModuleLoader__.load({ id: "dsh-notify-plugin", factory: (require) => {


		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/rpc.ts
		/**
		* Browser-side RPC contract for the notify configuration channel.
		*
		* The channel/endpoint strings and the config wire shape are DUPLICATED with
		* `src/notify-rpc.ts` / `src/types.ts` (the browser bundle cannot import a Host
		* file). Keep them in lockstep. The client calls a loopback-only channel on the
		* host `connection.rpc`; the host applies the write and persists it.
		*/
		/** Absolute logical channel the host registers (see src/notify-rpc.ts). */
		const NOTIFY_RPC_CHANNEL = "/dsh-notify";
		/** Endpoint names (see src/notify-rpc.ts). */
		const NOTIFY_ENDPOINTS = Object.freeze({
			configGet: "notify.config.get",
			configSet: "notify.config.set"
		});
		//#endregion
		//#region \0dsh-css:src/client/NotifySettings.module.css.mjs
		const css = ".fetK9G_page{flex-direction:column;gap:20px;max-width:640px;padding:8px 4px 32px;font-size:13px;display:flex}.fetK9G_pageHint{opacity:.68;margin:0;font-size:12px;line-height:1.5}.fetK9G_status{opacity:.7;margin:0;font-size:13px}.fetK9G_section{border:1px solid var(--dsw-alias-border-l2,#7f7f7f38);border-radius:12px;flex-direction:column;gap:4px;padding:14px 16px;display:flex}.fetK9G_sectionTitle{text-transform:uppercase;letter-spacing:.04em;opacity:.55;margin:0 0 6px;font-size:12px;font-weight:600}.fetK9G_field{flex-direction:column;gap:6px;padding:6px 0;display:flex}.fetK9G_fieldHead{justify-content:space-between;align-items:center;gap:8px;display:flex}.fetK9G_label{font-size:13px;line-height:1.3}.fetK9G_hint{opacity:.6;margin:0;font-size:11px}.fetK9G_input{box-sizing:border-box;width:100%;font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-2,#7f7f7f0d);border:1px solid var(--dsw-alias-border-l2,#7f7f7f40);border-radius:8px;padding:8px 10px;font-size:13px}.fetK9G_input:focus{outline:2px solid var(--dsw-alias-brand-primary,#4f6ef7);outline-offset:-1px;border-color:#0000}.fetK9G_input:disabled{opacity:.55}.fetK9G_toggle{flex:none;width:34px;height:20px;position:relative}.fetK9G_toggleInput{opacity:0;cursor:pointer;margin:0;position:absolute;top:0;bottom:0;left:0;right:0}.fetK9G_toggleInput:disabled{cursor:default}.fetK9G_toggleTrack{background:var(--dsw-alias-border-l2,#7f7f7f4d);border-radius:999px;transition:background .14s;position:absolute;top:0;bottom:0;left:0;right:0}.fetK9G_toggleInput:checked+.fetK9G_toggleTrack{background:var(--dsw-alias-brand-primary,#4f6ef7)}.fetK9G_toggleThumb{background:#fff;border-radius:50%;width:16px;height:16px;transition:transform .14s;position:absolute;top:2px;left:2px;box-shadow:0 1px 2px #0000004d}.fetK9G_toggleInput:checked+.fetK9G_toggleTrack+.fetK9G_toggleThumb{transform:translate(14px)}.fetK9G_toggleInput:disabled+.fetK9G_toggleTrack,.fetK9G_toggleInput:disabled+.fetK9G_toggleTrack+.fetK9G_toggleThumb{opacity:.6}.fetK9G_select{border:1px solid var(--dsw-alias-border-l2,#7f7f7f40);border-radius:8px;width:fit-content;display:inline-flex;overflow:hidden}.fetK9G_selectOption{font:inherit;cursor:pointer;color:inherit;opacity:.7;background:0 0;border:0;padding:6px 12px;font-size:12px}.fetK9G_selectOption+.fetK9G_selectOption{border-left:1px solid var(--dsw-alias-border-l2,#7f7f7f40)}.fetK9G_selectOption[data-active]{background:var(--dsw-alias-brand-primary,#4f6ef7);color:#fff;opacity:1}.fetK9G_selectOption:disabled{opacity:.4;cursor:default}.fetK9G_footer{justify-content:flex-end;align-items:center;gap:10px;margin-top:4px;display:flex}.fetK9G_failed{color:var(--dsw-alias-state-error-primary,#dc2626);margin:0 auto 0 0;font-size:12px}.fetK9G_discard{font:inherit;border:1px solid var(--dsw-alias-border-l2,#7f7f7f4d);cursor:pointer;color:inherit;background:0 0;border-radius:8px;padding:7px 14px;font-size:13px}.fetK9G_discard:hover{background:var(--dsw-alias-bg-layer-2,#7f7f7f14)}.fetK9G_discard:disabled{opacity:.5;cursor:default}.fetK9G_save{font:inherit;background:var(--dsw-alias-brand-primary,#4f6ef7);color:#fff;cursor:pointer;border:0;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600}.fetK9G_save:hover{filter:brightness(1.06)}.fetK9G_save:disabled{opacity:.5;cursor:default}";
		const tagId = "dsh-notify-plugin/NotifySettings.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-notify-plugin";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var NotifySettings_module_css_default = {
			"sectionTitle": "fetK9G_sectionTitle",
			"toggleThumb": "fetK9G_toggleThumb",
			"fieldHead": "fetK9G_fieldHead",
			"field": "fetK9G_field",
			"pageHint": "fetK9G_pageHint",
			"label": "fetK9G_label",
			"toggleInput": "fetK9G_toggleInput",
			"save": "fetK9G_save",
			"footer": "fetK9G_footer",
			"hint": "fetK9G_hint",
			"select": "fetK9G_select",
			"discard": "fetK9G_discard",
			"page": "fetK9G_page",
			"toggle": "fetK9G_toggle",
			"input": "fetK9G_input",
			"toggleTrack": "fetK9G_toggleTrack",
			"section": "fetK9G_section",
			"selectOption": "fetK9G_selectOption",
			"failed": "fetK9G_failed",
			"status": "fetK9G_status"
		};
		//#endregion
		//#region src/client/NotifySettings.tsx
		/**
		* The "通知" settings page — a top-level Settings sidebar entry that lets the
		* user configure notify channels and event filters. Data is read/written over
		* the host's /dsh-notify RPC channel; edits are staged locally and committed as
		* one config write on Save, and the host persists them for the next start.
		*/
		/**
		* Recursively set a path like `channels.system.sound` in a shallow copy.
		* @param obj - source object.
		* @param path - dot path to the leaf.
		* @param value - leaf value.
		* @returns a new object with the leaf replaced.
		*/
		function setAt(obj, path, value) {
			const parts = path.split(".");
			const head = parts[0];
			if (parts.length === 1) return {
				...obj,
				[head]: value
			};
			const next = obj[head] ?? {};
			return {
				...obj,
				[head]: setAt(next, parts.slice(1).join("."), value)
			};
		}
		/** Read a value at a dot path. */
		function getAt(obj, path) {
			return path.split(".").reduce((acc, key) => acc && typeof acc === "object" ? acc[key] : void 0, obj);
		}
		/** Default config the page shows before the first load lands. */
		const DEFAULTS = {
			enabled: true,
			channels: {
				system: {
					enabled: true,
					sound: true,
					soundName: ""
				},
				webhook: {
					enabled: false,
					url: ""
				},
				wecom: {
					enabled: false,
					webhookUrl: "",
					msgType: "markdown"
				},
				telegram: {
					enabled: false,
					botToken: "",
					chatId: "",
					parseMode: "HTML"
				}
			},
			events: {
				conversationCompleted: true,
				conversationPaused: true,
				conversationFailed: true,
				authorizationRequired: true,
				confirmationRequired: true
			},
			titlePrefix: ""
		};
		/** One labelled toggle row. */
		function ToggleRow(props) {
			const { t } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: NotifySettings_module_css_default.field,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: NotifySettings_module_css_default.fieldHead,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
						className: NotifySettings_module_css_default.label,
						htmlFor: `notify-${props.labelKey}`,
						children: t(props.labelKey)
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: NotifySettings_module_css_default.toggle,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								id: `notify-${props.labelKey}`,
								className: NotifySettings_module_css_default.toggleInput,
								type: "checkbox",
								checked: props.checked,
								disabled: props.disabled === true,
								onChange: (event) => {
									props.onChange(event.target.checked);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: NotifySettings_module_css_default.toggleTrack }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: NotifySettings_module_css_default.toggleThumb })
						]
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: NotifySettings_module_css_default.hint,
					children: t(props.hintKey)
				})]
			});
		}
		/** One text input row. */
		function TextRow(props) {
			const { t } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: NotifySettings_module_css_default.field,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
						className: NotifySettings_module_css_default.label,
						htmlFor: `notify-${props.labelKey}`,
						children: t(props.labelKey)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						id: `notify-${props.labelKey}`,
						className: NotifySettings_module_css_default.input,
						type: "text",
						value: props.value,
						placeholder: props.placeholder ?? "",
						disabled: props.disabled === true,
						spellCheck: false,
						onChange: (event) => {
							props.onChange(event.target.value);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: NotifySettings_module_css_default.hint,
						children: t(props.hintKey)
					})
				]
			});
		}
		/** A segmented enum select (markdown/text, HTML/MarkdownV2/text). */
		function SelectRow(props) {
			const { t } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: NotifySettings_module_css_default.field,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
					className: NotifySettings_module_css_default.label,
					children: t(props.labelKey)
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: NotifySettings_module_css_default.select,
					role: "radiogroup",
					"aria-label": t(props.labelKey),
					children: props.options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: NotifySettings_module_css_default.selectOption,
						"data-active": props.value === option ? "" : void 0,
						disabled: props.disabled === true,
						role: "radio",
						"aria-checked": props.value === option,
						onClick: () => {
							props.onChange(option);
						},
						children: option
					}, option))
				})]
			});
		}
		/** The full notify configuration page. */
		function NotifySettings(props) {
			const { t } = props;
			const [load, setLoad] = (0, react.useState)({ status: "loading" });
			const [config, setConfig] = (0, react.useState)(DEFAULTS);
			const [draft, setDraft] = (0, react.useState)(DEFAULTS);
			const [saving, setSaving] = (0, react.useState)(false);
			const [saveError, setSaveError] = (0, react.useState)(null);
			const dirty = (0, react.useMemo)(() => JSON.stringify(config) !== JSON.stringify(draft), [config, draft]);
			const fetchConfig = async () => {
				const res = await props.rpcCall(NOTIFY_RPC_CHANNEL, NOTIFY_ENDPOINTS.configGet, {});
				if (res.ok && res.value && typeof res.value === "object") {
					setConfig(res.value);
					setDraft(res.value);
					setLoad({ status: "ready" });
				} else if (!res.ok) setLoad({
					status: "error",
					message: res.error?.message ?? "failed to load config"
				});
				else setLoad({
					status: "error",
					message: "config not available"
				});
			};
			(0, react.useEffect)(() => {
				fetchConfig();
			}, []);
			const setField = (path, value) => {
				setDraft((d) => setAt({ ...d }, path, value));
				setSaveError(null);
			};
			const save = async () => {
				setSaving(true);
				setSaveError(null);
				const res = await props.rpcCall(NOTIFY_RPC_CHANNEL, NOTIFY_ENDPOINTS.configSet, draft);
				if (res.ok) {
					const next = res.value ?? draft;
					setConfig(next);
					setDraft(next);
				} else setSaveError(res.error?.message ?? "save failed");
				setSaving(false);
			};
			const startOver = () => {
				setDraft(config);
				setSaveError(null);
			};
			const c = (path) => getAt(draft, path);
			const cd = (path, fallback) => {
				const v = c(path);
				return typeof v === "boolean" ? v : fallback;
			};
			const cs = (path, fallback = "") => {
				const v = c(path);
				return typeof v === "string" ? v : typeof v === "number" ? String(v) : fallback;
			};
			const enabled = () => cd("enabled", true);
			if (load.status === "loading") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: NotifySettings_module_css_default.page,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: NotifySettings_module_css_default.status,
					children: t("loading")
				})
			});
			if (load.status === "error") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: NotifySettings_module_css_default.page,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					className: NotifySettings_module_css_default.status,
					role: "alert",
					children: [
						t("loadError"),
						": ",
						load.message
					]
				})
			});
			const sysOn = cd("channels.system.enabled", true);
			const webhookOn = cd("channels.webhook.enabled", false);
			const wecomOn = cd("channels.wecom.enabled", false);
			const telegramOn = cd("channels.telegram.enabled", false);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: NotifySettings_module_css_default.page,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: NotifySettings_module_css_default.pageHint,
						children: t("pageHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: NotifySettings_module_css_default.section,
						"aria-label": t("notify"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							className: NotifySettings_module_css_default.sectionTitle,
							children: t("notifyTitle")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
							t,
							labelKey: "enabled",
							hintKey: "enabledHint",
							checked: enabled(),
							onChange: (v) => setField("enabled", v)
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: NotifySettings_module_css_default.section,
						"aria-label": t("channelsSystem"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: NotifySettings_module_css_default.sectionTitle,
								children: t("channelsSystem")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
								t,
								labelKey: "systemEnabled",
								hintKey: "systemEnabledHint",
								checked: sysOn,
								disabled: !enabled(),
								onChange: (v) => setField("channels.system.enabled", v)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
								t,
								labelKey: "systemSound",
								hintKey: "systemSoundHint",
								checked: cd("channels.system.sound", true),
								disabled: !enabled() || !sysOn,
								onChange: (v) => setField("channels.system.sound", v)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextRow, {
								t,
								labelKey: "systemSoundName",
								hintKey: "systemSoundNameHint",
								placeholder: "Glass",
								value: cs("channels.system.soundName"),
								disabled: !enabled(),
								onChange: (v) => setField("channels.system.soundName", v)
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: NotifySettings_module_css_default.section,
						"aria-label": t("channelsWebhook"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: NotifySettings_module_css_default.sectionTitle,
								children: t("channelsWebhook")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
								t,
								labelKey: "webhookEnabled",
								hintKey: "webhookEnabledHint",
								checked: webhookOn,
								disabled: !enabled(),
								onChange: (v) => setField("channels.webhook.enabled", v)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextRow, {
								t,
								labelKey: "webhookUrl",
								hintKey: "webhookUrlHint",
								placeholder: "https://example.com/notify",
								value: cs("channels.webhook.url"),
								disabled: !enabled(),
								onChange: (v) => setField("channels.webhook.url", v)
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: NotifySettings_module_css_default.section,
						"aria-label": t("channelsWecom"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: NotifySettings_module_css_default.sectionTitle,
								children: t("channelsWecom")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
								t,
								labelKey: "wecomEnabled",
								hintKey: "wecomEnabledHint",
								checked: wecomOn,
								disabled: !enabled(),
								onChange: (v) => setField("channels.wecom.enabled", v)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextRow, {
								t,
								labelKey: "wecomWebhookUrl",
								hintKey: "wecomWebhookUrlHint",
								placeholder: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…",
								value: cs("channels.wecom.webhookUrl"),
								disabled: !enabled(),
								onChange: (v) => setField("channels.wecom.webhookUrl", v)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectRow, {
								t,
								labelKey: "wecomMsgType",
								options: ["markdown", "text"],
								value: cs("channels.wecom.msgType", "markdown"),
								disabled: !enabled() || !wecomOn,
								onChange: (v) => setField("channels.wecom.msgType", v)
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: NotifySettings_module_css_default.section,
						"aria-label": t("channelsTelegram"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: NotifySettings_module_css_default.sectionTitle,
								children: t("channelsTelegram")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
								t,
								labelKey: "telegramEnabled",
								hintKey: "telegramEnabledHint",
								checked: telegramOn,
								disabled: !enabled(),
								onChange: (v) => setField("channels.telegram.enabled", v)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextRow, {
								t,
								labelKey: "telegramToken",
								hintKey: "telegramTokenHint",
								placeholder: "123456:ABC-DEF…",
								value: cs("channels.telegram.botToken"),
								disabled: !enabled() || !telegramOn,
								onChange: (v) => setField("channels.telegram.botToken", v)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextRow, {
								t,
								labelKey: "telegramChatId",
								hintKey: "telegramChatIdHint",
								placeholder: "123456789",
								value: cs("channels.telegram.chatId"),
								disabled: !enabled() || !telegramOn,
								onChange: (v) => setField("channels.telegram.chatId", v)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectRow, {
								t,
								labelKey: "telegramParseMode",
								options: [
									"HTML",
									"MarkdownV2",
									"text"
								],
								value: cs("channels.telegram.parseMode", "HTML"),
								disabled: !enabled() || !telegramOn,
								onChange: (v) => setField("channels.telegram.parseMode", v)
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: NotifySettings_module_css_default.section,
						"aria-label": t("eventsTitle"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							className: NotifySettings_module_css_default.sectionTitle,
							children: t("eventsTitle")
						}), [
							"conversationCompleted",
							"conversationPaused",
							"conversationFailed",
							"authorizationRequired",
							"confirmationRequired"
						].map((key) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
							t,
							labelKey: key,
							hintKey: `${key}Hint`,
							checked: cd(`events.${key}`, true),
							disabled: !enabled(),
							onChange: (v) => setField(`events.${key}`, v)
						}, key))]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: NotifySettings_module_css_default.section,
						"aria-label": t("titlePrefix"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							className: NotifySettings_module_css_default.sectionTitle,
							children: t("titlePrefix")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextRow, {
							t,
							labelKey: "titlePrefix",
							hintKey: "titlePrefixHint",
							placeholder: "[MyApp]",
							value: cs("titlePrefix"),
							disabled: !enabled(),
							onChange: (v) => setField("titlePrefix", v)
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: NotifySettings_module_css_default.footer,
						children: [
							saveError ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								className: NotifySettings_module_css_default.failed,
								role: "alert",
								children: [
									t("saveFailed"),
									": ",
									saveError
								]
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: NotifySettings_module_css_default.discard,
								disabled: !dirty || saving,
								onClick: startOver,
								children: t("discard")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: NotifySettings_module_css_default.save,
								disabled: !dirty || saving,
								onClick: () => void save(),
								children: saving ? t("saving") : t("save")
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* zh/en dictionaries for the notify settings page (settings.section, nav
		* label "通知"/"Notify"). Keys are shared between the nav label and the page
		* controls; `nav` is the sidebar entry label.
		*/
		const zh = {
			nav: "通知",
			loading: "加载中…",
			loadError: "无法加载通知配置",
			save: "保存",
			saving: "保存中…",
			discard: "放弃修改",
			saveFailed: "保存失败",
			pageHint: "在这里配置通知渠道与触发事件。修改后点击「保存」，配置会持久化并在下次启动时生效。",
			notifyTitle: "通知",
			enabled: "启用通知",
			enabledHint: "开关全局（关闭后不发任何通知）",
			channelsSystem: "系统通知",
			systemEnabled: "系统通知",
			systemEnabledHint: "发送桌面原生通知",
			systemSound: "提示音",
			systemSoundHint: "通知时播放提示音",
			systemSoundName: "提示音名称",
			systemSoundNameHint: "macOS 声音名：Glass、Ping、Sosumi、Basso 等",
			channelsWebhook: "Webhook",
			webhookEnabled: "Webhook 通知",
			webhookEnabledHint: "向自定义 URL 发送 POST 请求",
			webhookUrl: "Webhook URL",
			webhookUrlHint: "接收通知的 HTTP endpoint",
			channelsWecom: "企业微信",
			wecomEnabled: "企业微信机器人",
			wecomEnabledHint: "企业微信群机器人通知",
			wecomWebhookUrl: "企业微信 Webhook URL",
			wecomWebhookUrlHint: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…",
			wecomMsgType: "消息类型",
			channelsTelegram: "Telegram",
			telegramEnabled: "Telegram 机器人",
			telegramEnabledHint: "Telegram 通知",
			telegramToken: "Bot Token",
			telegramTokenHint: "从 @BotFather 获取的机器人 token",
			telegramChatId: "Chat ID",
			telegramChatIdHint: "接收通知的用户或群组 ID",
			telegramParseMode: "解析模式",
			eventsTitle: "触发事件",
			conversationCompleted: "对话完成",
			conversationCompletedHint: "任务成功完成时提醒",
			conversationPaused: "对话暂停",
			conversationPausedHint: "被中断或等待输入时提醒",
			conversationFailed: "对话失败",
			conversationFailedHint: "遇到错误时提醒",
			authorizationRequired: "需要授权",
			authorizationRequiredHint: "请求沙箱权限提升时提醒",
			confirmationRequired: "需要回答",
			confirmationRequiredHint: "Agent 向你提问时提醒",
			titlePrefix: "标题前缀",
			titlePrefixHint: "所有通知标题统一加的前缀，留空不加"
		};
		const en = {
			nav: "Notification",
			loading: "Loading…",
			loadError: "Failed to load notification config",
			save: "Save",
			saving: "Saving…",
			discard: "Discard",
			saveFailed: "Save failed",
			pageHint: "Configure notification channels and trigger events. Changes take effect on Save and persist across restarts.",
			notifyTitle: "Notifications",
			enabled: "Enable notifications",
			enabledHint: "Global switch (off disables every notification)",
			channelsSystem: "System",
			systemEnabled: "System notifications",
			systemEnabledHint: "Send native desktop notifications",
			systemSound: "Play sound",
			systemSoundHint: "Play an alert sound with the notification",
			systemSoundName: "Sound name",
			systemSoundNameHint: "macOS sound: Glass, Ping, Sosumi, Basso, etc.",
			channelsWebhook: "Webhook",
			webhookEnabled: "Webhook",
			webhookEnabledHint: "POST to a custom endpoint",
			webhookUrl: "Webhook URL",
			webhookUrlHint: "HTTP endpoint that receives notifications",
			channelsWecom: "WeCom",
			wecomEnabled: "WeCom bot",
			wecomEnabledHint: "Enterprise WeChat group-bot notifications",
			wecomWebhookUrl: "WeCom webhook URL",
			wecomWebhookUrlHint: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…",
			wecomMsgType: "Message type",
			channelsTelegram: "Telegram",
			telegramEnabled: "Telegram bot",
			telegramEnabledHint: "Telegram notifications",
			telegramToken: "Bot token",
			telegramTokenHint: "Bot token from @BotFather",
			telegramChatId: "Chat ID",
			telegramChatIdHint: "User or group ID that receives notifications",
			telegramParseMode: "Parse mode",
			eventsTitle: "Triggers",
			conversationCompleted: "Conversation completed",
			conversationCompletedHint: "Notify when a task succeeds",
			conversationPaused: "Conversation paused",
			conversationPausedHint: "Notify when interrupted or awaiting input",
			conversationFailed: "Conversation failed",
			conversationFailedHint: "Notify on errors",
			authorizationRequired: "Authorization required",
			authorizationRequiredHint: "Notify when sandbox permission escalation is requested",
			confirmationRequired: "Question to answer",
			confirmationRequiredHint: "Notify when the agent asks you something",
			titlePrefix: "Title prefix",
			titlePrefixHint: "Prefix added to every notification title; empty for none"
		};
		//#endregion
		//#region src/client/index.ts
		/**
		* dsh-notify-plugin browser half: registers a top-level "通知" settings page
		* (settings.section) — the same entry style dsh-pocket uses — through which the
		* user views and edits the notify configuration.
		*
		* The page talks to the host over the loopback-only /dsh-notify RPC channel
		* (ctx.connection.rpc.call) rather than the settings scope, so it needs no
		* `@deepseek-ai/dsh-client-*` runtime dependency beyond what the DSH host
		* injects. See src/notify-rpc.ts for the host side.
		*
		* Built by tsdown into the DSH window.__ModuleLoader__.load closure-factory
		* bundle at client/client.js.
		*/
		/** Dictionary namespace owned by this settings page. */
		const NS = "settings.notify";
		const name = "dsh-notify-plugin";
		/** Required services this page injects (host-provided cordis services). */
		const inject = [
			"slots",
			"connection",
			"locale"
		];
		/** Mount the notify settings page into the Settings sidebar. */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "notify: settings dictionaries");
			const t = ctx.locale.bind(NS);
			const rpcCall = (channel, endpoint, payload, signal) => {
				return ctx.connection.rpc.call(channel, endpoint, payload, signal).then((result) => ({
					ok: Boolean(result?.ok),
					value: result && result.ok ? result.value : void 0,
					error: result && !result.ok ? result?.error : void 0
				}));
			};
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "notify",
				order: 60,
				label: () => t("nav"),
				locale: NS,
				inject: () => ({ rpcCall })
			}, NotifySettings));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map