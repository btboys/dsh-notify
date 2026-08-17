window.__ModuleLoader__.load({ id: "dsh-notify-plugin", factory: (require) => {


		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/controller.ts
		/** Enum select fields. */
		const SELECT_FIELDS = {
			wecomMsgType: ["markdown", "text"],
			telegramParseMode: [
				"HTML",
				"MarkdownV2",
				"text"
			]
		};
		const VALUE_FIELD = /^(systemSoundName|webhookUrl|wecomWebhookUrl|telegramBotToken|telegramChatId|titlePrefix)$/;
		/** Read the effective scalar for a field (default applied). */
		function effective(scope, field) {
			const raw = scope.getSnapshot().value?.[field];
			if (raw !== void 0) return raw;
			return BOOL_DEFAULTS[field];
		}
		const BOOL_DEFAULTS = {
			enabled: true,
			systemEnabled: true,
			systemSound: true,
			webhookEnabled: false,
			wecomEnabled: false,
			telegramEnabled: false,
			notifyOnCompleted: true,
			notifyOnPaused: true,
			notifyOnFailed: true,
			notifyOnAuthorization: true,
			notifyOnConfirmation: true
		};
		const TEXT_DEFAULTS = {
			systemSoundName: "",
			webhookUrl: "",
			wecomWebhookUrl: "",
			telegramBotToken: "",
			telegramChatId: "",
			titlePrefix: ""
		};
		const SELECT_DEFAULTS = {
			wecomMsgType: "markdown",
			telegramParseMode: "HTML"
		};
		/** Whether the user layer currently carries a value for a field. */
		function overridden(scope, field) {
			const user = scope.getSnapshot().user;
			return user !== void 0 && Object.hasOwn(user, field);
		}
		/** The notify card's staged form over its namespace scope. */
		var NotifyCardController = class {
			/** @param scope - the bound `notify` namespace scope (host-injected). */
			constructor(scope) {
				this.scope = scope;
				this.staged = /* @__PURE__ */ new Map();
				this.listeners = /* @__PURE__ */ new Set();
				this.saving = false;
				this.failed = false;
				scope.subscribe(() => this.publish());
			}
			/** @returns the current card snapshot. */
			getSnapshot() {
				const snapshot = this.scope.getSnapshot();
				return {
					available: snapshot.status === "ready",
					writable: snapshot.writable,
					dirty: this.plan().length > 0,
					invalid: this.plan().some((item) => item.run === void 0),
					saving: this.saving,
					failed: this.failed,
					enabled: this.bool("enabled"),
					systemEnabled: this.bool("systemEnabled"),
					systemSound: this.bool("systemSound"),
					systemSoundName: this.text("systemSoundName"),
					webhookEnabled: this.bool("webhookEnabled"),
					webhookUrl: this.text("webhookUrl"),
					wecomEnabled: this.bool("wecomEnabled"),
					wecomWebhookUrl: this.text("wecomWebhookUrl"),
					wecomMsgType: this.select("wecomMsgType"),
					telegramEnabled: this.bool("telegramEnabled"),
					telegramToken: this.text("telegramBotToken"),
					telegramChatId: this.text("telegramChatId"),
					telegramParseMode: this.select("telegramParseMode"),
					notifyOnCompleted: this.bool("notifyOnCompleted"),
					notifyOnPaused: this.bool("notifyOnPaused"),
					notifyOnFailed: this.bool("notifyOnFailed"),
					notifyOnAuthorization: this.bool("notifyOnAuthorization"),
					notifyOnConfirmation: this.bool("notifyOnConfirmation"),
					titlePrefix: this.text("titlePrefix")
				};
			}
			/** Subscribe to card snapshot changes. @returns a disposer. */
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			/** Build the actions the card's slot entry injects. */
			actions() {
				return {
					editText: (field, text) => this.stage(field, {
						kind: "text",
						text
					}),
					toggle: (field, value) => this.stageValue(field, value),
					pick: (field, value) => this.stageValue(field, value),
					resetField: (field) => {
						this.stage(field, { kind: "clear" });
					},
					save: () => {
						this.save();
					},
					discard: () => {
						this.discard();
					}
				};
			}
			bool(field) {
				return {
					value: Boolean(effective(this.scope, field)),
					overridden: overridden(this.scope, field)
				};
			}
			text(field) {
				const staged = this.staged.get(field);
				if (staged === void 0) return {
					text: String(effective(this.scope, field) ?? TEXT_DEFAULTS[field] ?? ""),
					overridden: overridden(this.scope, field)
				};
				if (staged.kind === "clear") return {
					text: String(this.baseValue(field) ?? TEXT_DEFAULTS[field] ?? ""),
					overridden: false
				};
				return {
					text: staged.kind === "text" ? staged.text : String(staged.value ?? ""),
					overridden: true
				};
			}
			select(field) {
				const staged = this.staged.get(field);
				if (staged !== void 0 && staged.kind === "value") return {
					value: String(staged.value),
					overridden: true
				};
				return {
					value: String(effective(this.scope, field) ?? SELECT_DEFAULTS[field] ?? SELECT_FIELDS[field]?.[0] ?? ""),
					overridden: overridden(this.scope, field)
				};
			}
			stageValue(field, value) {
				this.stage(field, {
					kind: "value",
					value
				});
			}
			stage(field, edit) {
				this.staged.set(field, edit);
				this.failed = false;
				this.publish();
			}
			discard() {
				if (this.staged.size === 0 && !this.failed) return;
				this.staged.clear();
				this.failed = false;
				this.publish();
			}
			async save() {
				const plan = this.plan();
				if (plan.length === 0 || this.saving || plan.some((item) => item.run === void 0)) return;
				this.saving = true;
				this.failed = false;
				this.publish();
				let landed = true;
				for (const item of plan) landed = await item.run() && landed;
				if (landed) this.staged.clear();
				this.saving = false;
				this.failed = !landed;
				this.publish();
			}
			/** Every staged edit a save would write, in the order they were staged. */
			plan() {
				const plan = [];
				for (const [field, staged] of this.staged) if (staged.kind === "clear") plan.push({ run: overridden(this.scope, field) ? () => this.clear(field) : void 0 });
				else if (staged.kind === "text") {
					if (staged.text === String(this.effectiveText(field))) continue;
					if (staged.text.trim() === "" && VALUE_FIELD.test(field)) plan.push({ run: overridden(this.scope, field) ? () => this.clear(field) : void 0 });
					else {
						const value = typeof staged.text === "string" ? staged.text : String(staged.text);
						plan.push({ run: () => this.set(field, value) });
					}
				} else {
					if (staged.value === effective(this.scope, field)) continue;
					plan.push({ run: () => this.set(field, staged.value) });
				}
				return plan;
			}
			effectiveText(field) {
				return String(effective(this.scope, field) ?? TEXT_DEFAULTS[field] ?? "");
			}
			async set(field, value) {
				await this.scope.set(field, value);
				const user = this.scope.getSnapshot().user;
				return user !== void 0 && user[field] === value;
			}
			async clear(field) {
				await this.scope.unset(field);
				return !overridden(this.scope, field);
			}
			baseValue(field) {
				return this.scope.getSnapshot().base?.[field];
			}
			publish() {
				for (const listener of this.listeners) listener();
			}
		};
		//#endregion
		//#region \0dsh-css:src/client/NotifyCard.module.css.mjs
		const css = ".dn95IW_card{background:var(--dsh-surface-2,#fff);border:1px solid var(--dsh-border,#7f7f7f38);border-radius:10px;margin:0;transition:border-color .12s;overflow:hidden}.dn95IW_card[data-open]{border-color:var(--dsh-accent,#3178f6)}.dn95IW_header{cursor:pointer;text-align:left;width:100%;font:inherit;color:inherit;background:0 0;border:0;align-items:center;gap:12px;padding:14px 16px;display:flex}.dn95IW_header:hover{background:var(--dsh-surface-hover,#7f7f7f0f)}.dn95IW_headText{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}.dn95IW_name{font-size:14px;font-weight:600;line-height:1.3}.dn95IW_description{opacity:.68;font-size:12px;line-height:1.4}.dn95IW_pending{color:var(--dsh-accent,#3178f6);flex:none;font-size:11px}.dn95IW_chevron{opacity:.6;flex:none;transition:transform .15s}.dn95IW_chevronOpen{transform:rotate(180deg)}.dn95IW_body{border-top:1px solid var(--dsh-border,#7f7f7f24);padding:4px 16px 16px}.dn95IW_readOnly{opacity:.7;margin:12px 0;font-size:12px}.dn95IW_section{margin-top:14px}.dn95IW_section:first-child{margin-top:12px}.dn95IW_sectionTitle{text-transform:uppercase;letter-spacing:.04em;opacity:.55;align-items:center;gap:6px;margin:0 0 8px;font-size:12px;font-weight:600;display:flex}.dn95IW_field{flex-direction:column;gap:6px;padding:8px 0;display:flex}.dn95IW_fieldHead{justify-content:space-between;align-items:center;gap:8px;display:flex}.dn95IW_label{font-size:13px;line-height:1.3}.dn95IW_hint{opacity:.6;margin:0;font-size:11px}.dn95IW_badges{align-items:center;gap:6px;display:inline-flex}.dn95IW_badge{color:var(--dsh-accent,#3178f6);font-size:11px}.dn95IW_reset{color:inherit;opacity:.7;cursor:pointer;background:0 0;border:0;padding:0;font-size:11px;text-decoration:underline}.dn95IW_reset:hover{opacity:1}.dn95IW_reset:disabled{opacity:.4;cursor:default}.dn95IW_input{box-sizing:border-box;width:100%;font:inherit;color:inherit;background:var(--dsh-input,#7f7f7f0d);border:1px solid var(--dsh-border,#7f7f7f40);border-radius:7px;padding:8px 10px;font-size:13px}.dn95IW_input:focus{outline:2px solid var(--dsh-accent,#3178f6);outline-offset:-1px;border-color:#0000}.dn95IW_input:disabled{opacity:.55}.dn95IW_toggle{flex:none;width:34px;height:20px;position:relative}.dn95IW_toggleInput{opacity:0;cursor:pointer;margin:0;position:absolute;top:0;bottom:0;left:0;right:0}.dn95IW_toggleInput:disabled{cursor:default}.dn95IW_toggleTrack{background:var(--dsh-toggle-off,#7f7f7f4d);border-radius:999px;transition:background .14s;position:absolute;top:0;bottom:0;left:0;right:0}.dn95IW_toggleInput:checked+.dn95IW_toggleTrack{background:var(--dsh-accent,#3178f6)}.dn95IW_toggleThumb{background:#fff;border-radius:50%;width:16px;height:16px;transition:transform .14s;position:absolute;top:2px;left:2px;box-shadow:0 1px 2px #0000004d}.dn95IW_toggleInput:checked+.dn95IW_toggleTrack .dn95IW_toggleThumb,.dn95IW_toggleInput:checked~.dn95IW_toggleThumb{transform:translate(14px)}.dn95IW_toggleInput:disabled~.dn95IW_toggleThumb,.dn95IW_toggleInput:disabled+.dn95IW_toggleTrack{opacity:.6}.dn95IW_select{border:1px solid var(--dsh-border,#7f7f7f40);border-radius:7px;display:inline-flex;overflow:hidden}.dn95IW_selectOption{font:inherit;cursor:pointer;color:inherit;opacity:.7;background:0 0;border:0;padding:6px 12px;font-size:12px}.dn95IW_selectOption+.dn95IW_selectOption{border-left:1px solid var(--dsh-border,#7f7f7f40)}.dn95IW_selectOption[data-active]{background:var(--dsh-accent,#3178f6);color:#fff;opacity:1}.dn95IW_selectOption:disabled{opacity:.4;cursor:default}.dn95IW_footer{justify-content:flex-end;align-items:center;gap:10px;margin-top:16px;display:flex}.dn95IW_failed{color:var(--dsh-danger,#e5484d);margin:0 auto 0 0;font-size:12px}.dn95IW_discard{font:inherit;border:1px solid var(--dsh-border,#7f7f7f4d);cursor:pointer;color:inherit;background:0 0;border-radius:7px;padding:7px 14px;font-size:13px}.dn95IW_discard:hover{background:var(--dsh-surface-hover,#7f7f7f14)}.dn95IW_discard:disabled{opacity:.5;cursor:default}.dn95IW_save{font:inherit;background:var(--dsh-accent,#3178f6);color:#fff;cursor:pointer;border:0;border-radius:7px;padding:7px 16px;font-size:13px;font-weight:600}.dn95IW_save:hover{filter:brightness(1.06)}.dn95IW_save:disabled{opacity:.5;cursor:default}";
		const tagId = "dsh-notify-plugin/NotifyCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-notify-plugin";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var NotifyCard_module_css_default = {
			"card": "dn95IW_card",
			"chevronOpen": "dn95IW_chevronOpen",
			"toggleInput": "dn95IW_toggleInput",
			"badge": "dn95IW_badge",
			"footer": "dn95IW_footer",
			"readOnly": "dn95IW_readOnly",
			"pending": "dn95IW_pending",
			"discard": "dn95IW_discard",
			"save": "dn95IW_save",
			"name": "dn95IW_name",
			"reset": "dn95IW_reset",
			"badges": "dn95IW_badges",
			"failed": "dn95IW_failed",
			"label": "dn95IW_label",
			"hint": "dn95IW_hint",
			"toggleThumb": "dn95IW_toggleThumb",
			"sectionTitle": "dn95IW_sectionTitle",
			"chevron": "dn95IW_chevron",
			"headText": "dn95IW_headText",
			"description": "dn95IW_description",
			"toggle": "dn95IW_toggle",
			"field": "dn95IW_field",
			"header": "dn95IW_header",
			"input": "dn95IW_input",
			"section": "dn95IW_section",
			"fieldHead": "dn95IW_fieldHead",
			"toggleTrack": "dn95IW_toggleTrack",
			"body": "dn95IW_body",
			"selectOption": "dn95IW_selectOption",
			"select": "dn95IW_select"
		};
		//#endregion
		//#region src/client/NotifyCard.tsx
		/**
		* The notify plugin's configuration card in the Settings → 插件配置 section.
		*
		* Self-contained: depends only on react and the DSH browser primitives
		* (icons, host-injected externals). It mirrors the shape of DSH's own plugin
		* cards (a disclosing header with an "unsaved" marker, staged controls with
		* override/reset badges, and a single Save that writes every draft) but ships
		* its own chrome and form so it needs no DSH-internal package.
		*/
		/** One boolean toggle row. */
		function ToggleRow(props) {
			const { t } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: NotifyCard_module_css_default.field,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: NotifyCard_module_css_default.fieldHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							className: NotifyCard_module_css_default.label,
							htmlFor: `notify-${props.field}`,
							children: t(props.labelKey)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: NotifyCard_module_css_default.badges,
							children: props.state.overridden ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: NotifyCard_module_css_default.badge,
								children: t("overridden")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: NotifyCard_module_css_default.reset,
								disabled: props.disabled,
								onClick: props.onReset,
								children: t("reset")
							})] }) : null
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: NotifyCard_module_css_default.toggle,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								id: `notify-${props.field}`,
								className: NotifyCard_module_css_default.toggleInput,
								type: "checkbox",
								checked: props.state.value,
								disabled: props.disabled,
								onChange: (event) => {
									props.onToggle(event.target.checked);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: NotifyCard_module_css_default.toggleTrack }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: NotifyCard_module_css_default.toggleThumb })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: NotifyCard_module_css_default.hint,
						children: t(props.hintKey)
					})
				]
			});
		}
		/** One text field row. */
		function TextFieldRow(props) {
			const { t } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: NotifyCard_module_css_default.field,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: NotifyCard_module_css_default.fieldHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							className: NotifyCard_module_css_default.label,
							htmlFor: `notify-${props.field}`,
							children: t(props.labelKey)
						}), props.state.overridden ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: NotifyCard_module_css_default.badges,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: NotifyCard_module_css_default.badge,
								children: t("overridden")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: NotifyCard_module_css_default.reset,
								disabled: props.disabled,
								onClick: props.onReset,
								children: t("reset")
							})]
						}) : null]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						id: `notify-${props.field}`,
						className: NotifyCard_module_css_default.input,
						type: "text",
						value: props.state.text,
						placeholder: props.placeholder ?? "",
						disabled: props.disabled,
						spellCheck: false,
						onChange: (event) => {
							props.onEdit(event.target.value);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: NotifyCard_module_css_default.hint,
						children: t(props.hintKey)
					})
				]
			});
		}
		/** One enum select row. */
		function SelectRow(props) {
			const { t } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: NotifyCard_module_css_default.field,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: NotifyCard_module_css_default.fieldHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							className: NotifyCard_module_css_default.label,
							children: t(props.labelKey)
						}), props.state.overridden ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: NotifyCard_module_css_default.badges,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: NotifyCard_module_css_default.badge,
								children: t("overridden")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: NotifyCard_module_css_default.reset,
								disabled: props.disabled,
								onClick: props.onReset,
								children: t("reset")
							})]
						}) : null]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: NotifyCard_module_css_default.select,
						role: "radiogroup",
						"aria-label": t(props.labelKey),
						children: props.options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: NotifyCard_module_css_default.selectOption,
							"data-active": props.state.value === option ? "" : void 0,
							disabled: props.disabled,
							"aria-checked": props.state.value === option,
							role: "radio",
							onClick: () => {
								props.onPick(option);
							},
							children: option
						}, option))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: NotifyCard_module_css_default.hint,
						children: t(props.hintKey)
					})
				]
			});
		}
		/** Render the notify configuration card. */
		function NotifyCard(props) {
			const [open, setOpen] = (0, react.useState)(false);
			const state = props.useNotifyCard((snapshot) => snapshot);
			const { t } = props;
			if (!state.available) return null;
			const blocked = !state.dirty || state.invalid || state.saving;
			const disabled = !state.writable || state.saving;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: NotifyCard_module_css_default.card,
				"data-open": open ? "" : void 0,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: NotifyCard_module_css_default.header,
					"aria-expanded": open,
					"aria-label": `${t(open ? "collapse" : "expand")}: ${t("notifyTitle")}`,
					onClick: () => {
						setOpen(!open);
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: NotifyCard_module_css_default.headText,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: NotifyCard_module_css_default.name,
								children: t("notifyTitle")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: NotifyCard_module_css_default.description,
								children: t("notifyDescription")
							})]
						}),
						state.dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: NotifyCard_module_css_default.pending,
							children: t("unsaved")
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: open ? NotifyCard_module_css_default.chevronOpen : NotifyCard_module_css_default.chevron })
					]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: NotifyCard_module_css_default.body,
					children: [
						!state.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: NotifyCard_module_css_default.readOnly,
							role: "status",
							children: t("readOnly")
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: NotifyCard_module_css_default.section,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: NotifyCard_module_css_default.sectionTitle,
								children: t("notifyEnabled")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
								t,
								field: "enabled",
								labelKey: "notifyEnabled",
								hintKey: "notifyEnabledHint",
								state: state.enabled,
								disabled,
								onToggle: (v) => props.toggle("enabled", v),
								onReset: () => props.resetField("enabled")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: NotifyCard_module_css_default.section,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: NotifyCard_module_css_default.sectionTitle,
									children: t("systemEnabled")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
									t,
									field: "systemEnabled",
									labelKey: "systemEnabled",
									hintKey: "systemEnabledHint",
									state: state.systemEnabled,
									disabled: disabled || !state.enabled.value,
									onToggle: (v) => props.toggle("systemEnabled", v),
									onReset: () => props.resetField("systemEnabled")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
									t,
									field: "systemSound",
									labelKey: "systemSound",
									hintKey: "systemSoundHint",
									state: state.systemSound,
									disabled: disabled || !state.systemEnabled.value,
									onToggle: (v) => props.toggle("systemSound", v),
									onReset: () => props.resetField("systemSound")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextFieldRow, {
									t,
									field: "systemSoundName",
									labelKey: "systemSoundName",
									hintKey: "systemSoundNameHint",
									placeholder: "Glass",
									state: state.systemSoundName,
									disabled,
									onEdit: (v) => props.editText("systemSoundName", v),
									onReset: () => props.resetField("systemSoundName")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: NotifyCard_module_css_default.section,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: NotifyCard_module_css_default.sectionTitle,
									children: t("webhookEnabled")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
									t,
									field: "webhookEnabled",
									labelKey: "webhookEnabled",
									hintKey: "webhookEnabledHint",
									state: state.webhookEnabled,
									disabled,
									onToggle: (v) => props.toggle("webhookEnabled", v),
									onReset: () => props.resetField("webhookEnabled")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextFieldRow, {
									t,
									field: "webhookUrl",
									labelKey: "webhookUrl",
									hintKey: "webhookUrlHint",
									placeholder: "https://example.com/notify",
									state: state.webhookUrl,
									disabled,
									onEdit: (v) => props.editText("webhookUrl", v),
									onReset: () => props.resetField("webhookUrl")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: NotifyCard_module_css_default.section,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: NotifyCard_module_css_default.sectionTitle,
									children: t("wecomEnabled")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
									t,
									field: "wecomEnabled",
									labelKey: "wecomEnabled",
									hintKey: "wecomEnabledHint",
									state: state.wecomEnabled,
									disabled,
									onToggle: (v) => props.toggle("wecomEnabled", v),
									onReset: () => props.resetField("wecomEnabled")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextFieldRow, {
									t,
									field: "wecomWebhookUrl",
									labelKey: "wecomWebhookUrl",
									hintKey: "wecomWebhookUrlHint",
									placeholder: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…",
									state: state.wecomWebhookUrl,
									disabled,
									onEdit: (v) => props.editText("wecomWebhookUrl", v),
									onReset: () => props.resetField("wecomWebhookUrl")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectRow, {
									t,
									field: "wecomMsgType",
									labelKey: "wecomMsgType",
									hintKey: "wecomMsgType",
									options: ["markdown", "text"],
									state: state.wecomMsgType,
									disabled,
									onPick: (v) => props.pick("wecomMsgType", v),
									onReset: () => props.resetField("wecomMsgType")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: NotifyCard_module_css_default.section,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: NotifyCard_module_css_default.sectionTitle,
									children: t("telegramEnabled")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
									t,
									field: "telegramEnabled",
									labelKey: "telegramEnabled",
									hintKey: "telegramEnabledHint",
									state: state.telegramEnabled,
									disabled,
									onToggle: (v) => props.toggle("telegramEnabled", v),
									onReset: () => props.resetField("telegramEnabled")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextFieldRow, {
									t,
									field: "telegramToken",
									labelKey: "telegramToken",
									hintKey: "telegramTokenHint",
									placeholder: "123456:ABC-DEF…",
									state: state.telegramToken,
									disabled,
									onEdit: (v) => props.editText("telegramBotToken", v),
									onReset: () => props.resetField("telegramBotToken")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextFieldRow, {
									t,
									field: "telegramChatId",
									labelKey: "telegramChatId",
									hintKey: "telegramChatIdHint",
									placeholder: "123456789",
									state: state.telegramChatId,
									disabled,
									onEdit: (v) => props.editText("telegramChatId", v),
									onReset: () => props.resetField("telegramChatId")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectRow, {
									t,
									field: "telegramParseMode",
									labelKey: "telegramParseMode",
									hintKey: "telegramParseMode",
									options: [
										"HTML",
										"MarkdownV2",
										"text"
									],
									state: state.telegramParseMode,
									disabled,
									onPick: (v) => props.pick("telegramParseMode", v),
									onReset: () => props.resetField("telegramParseMode")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: NotifyCard_module_css_default.section,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: NotifyCard_module_css_default.sectionTitle,
								children: t("notifyOnCompleted")
							}), [
								"notifyOnCompleted",
								"notifyOnPaused",
								"notifyOnFailed",
								"notifyOnAuthorization",
								"notifyOnConfirmation"
							].map((key) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
								t,
								field: key,
								labelKey: key,
								hintKey: `${key}Hint`,
								state: state[key],
								disabled,
								onToggle: (v) => props.toggle(key, v),
								onReset: () => props.resetField(key)
							}, key))]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: NotifyCard_module_css_default.section,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: NotifyCard_module_css_default.sectionTitle,
								children: t("titlePrefix")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextFieldRow, {
								t,
								field: "titlePrefix",
								labelKey: "titlePrefix",
								hintKey: "titlePrefixHint",
								placeholder: "[MyApp]",
								state: state.titlePrefix,
								disabled,
								onEdit: (v) => props.editText("titlePrefix", v),
								onReset: () => props.resetField("titlePrefix")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: NotifyCard_module_css_default.footer,
							children: [
								state.failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: NotifyCard_module_css_default.failed,
									role: "status",
									children: t("saveFailed")
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: NotifyCard_module_css_default.discard,
									disabled: !state.dirty || state.saving,
									onClick: props.discard,
									children: t("discard")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: NotifyCard_module_css_default.save,
									disabled: blocked,
									onClick: props.save,
									children: t(state.saving ? "saving" : "save")
								})
							]
						})
					]
				}) : null]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* zh/en dictionaries for the notify configuration card.
		* The dictionary namespace mirrors the host's `settings.plugins` section copy
		* keys for consistency ("save"/"discard"/"unsaved"/"overridden"…), plus the
		* notify-owned keys below.
		*/
		const zh = {
			nav: "插件",
			configurableTab: "配置",
			empty: "没有可配置的插件。",
			expand: "展开",
			collapse: "收起",
			unsaved: "有未保存的修改",
			save: "保存",
			saving: "保存中…",
			discard: "放弃",
			saveFailed: "保存失败，请重试",
			readOnly: "当前文档为只读，无法保存修改。",
			overridden: "已覆盖",
			reset: "重置",
			invalidNumber: "请输入有效数字",
			notifyTitle: "通知",
			notifyDescription: "对话完成、暂停、失败和提问时的提醒",
			notifyEnabled: "启用通知",
			notifyEnabledHint: "启用插件的全部通知",
			systemEnabled: "系统通知",
			systemEnabledHint: "发送桌面原生通知",
			systemSound: "提示音",
			systemSoundHint: "通知时播放提示音",
			systemSoundName: "提示音名称",
			systemSoundNameHint: "macOS 声音名：Glass、Ping、Sosumi、Basso 等",
			webhookEnabled: "Webhook 通知",
			webhookEnabledHint: "向自定义 URL 发送 POST 请求",
			webhookUrl: "Webhook URL",
			webhookUrlHint: "接收通知的 HTTP endpoint",
			wecomEnabled: "企业微信机器人",
			wecomEnabledHint: "企业微信群机器人通知",
			wecomWebhookUrl: "企业微信 Webhook URL",
			wecomWebhookUrlHint: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…",
			wecomMsgType: "消息类型",
			telegramEnabled: "Telegram 机器人",
			telegramEnabledHint: "Telegram 通知",
			telegramToken: "Bot Token",
			telegramTokenHint: "从 @BotFather 获取的机器人 token",
			telegramChatId: "Chat ID",
			telegramChatIdHint: "接收通知的用户或群组 ID",
			telegramParseMode: "解析模式",
			notifyOnCompleted: "对话完成",
			notifyOnCompletedHint: "任务成功完成时提醒",
			notifyOnPaused: "对话暂停",
			notifyOnPausedHint: "被中断或等待输入时提醒",
			notifyOnFailed: "对话失败",
			notifyOnFailedHint: "遇到错误时提醒",
			notifyOnAuthorization: "需要授权",
			notifyOnAuthorizationHint: "请求沙箱权限提升时提醒",
			notifyOnConfirmation: "需要回答",
			notifyOnConfirmationHint: "Agent 向你提问时提醒",
			titlePrefix: "标题前缀",
			titlePrefixHint: "所有通知标题统一加的前缀，留空不加"
		};
		const en = {
			nav: "Plugins",
			configurableTab: "Configurable",
			empty: "No configurable plugins.",
			expand: "Expand",
			collapse: "Collapse",
			unsaved: "Unsaved changes",
			save: "Save",
			saving: "Saving…",
			discard: "Discard",
			saveFailed: "Save failed, please retry",
			readOnly: "This document is read-only; changes cannot be saved.",
			overridden: "Overridden",
			reset: "Reset",
			invalidNumber: "Enter a valid number",
			notifyTitle: "Notify",
			notifyDescription: "Alerts on conversation completion, pause, failure, and prompts",
			notifyEnabled: "Enable notifications",
			notifyEnabledHint: "Enable all notifications from this plugin",
			systemEnabled: "System notifications",
			systemEnabledHint: "Send native desktop notifications",
			systemSound: "Play sound",
			systemSoundHint: "Play an alert sound with the notification",
			systemSoundName: "Sound name",
			systemSoundNameHint: "macOS sound: Glass, Ping, Sosumi, Basso, etc.",
			webhookEnabled: "Webhook",
			webhookEnabledHint: "POST to a custom endpoint",
			webhookUrl: "Webhook URL",
			webhookUrlHint: "HTTP endpoint that receives notifications",
			wecomEnabled: "WeCom bot",
			wecomEnabledHint: "Enterprise WeChat group-bot notifications",
			wecomWebhookUrl: "WeCom webhook URL",
			wecomWebhookUrlHint: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…",
			wecomMsgType: "Message type",
			telegramEnabled: "Telegram bot",
			telegramEnabledHint: "Telegram notifications",
			telegramToken: "Bot token",
			telegramTokenHint: "Bot token from @BotFather",
			telegramChatId: "Chat ID",
			telegramChatIdHint: "User or group ID that receives notifications",
			telegramParseMode: "Parse mode",
			notifyOnCompleted: "Conversation completed",
			notifyOnCompletedHint: "Notify when a task succeeds",
			notifyOnPaused: "Conversation paused",
			notifyOnPausedHint: "Notify when interrupted or awaiting input",
			notifyOnFailed: "Conversation failed",
			notifyOnFailedHint: "Notify on errors",
			notifyOnAuthorization: "Authorization required",
			notifyOnAuthorizationHint: "Notify when sandbox permission escalation is requested",
			notifyOnConfirmation: "Question to answer",
			notifyOnConfirmationHint: "Notify when the agent asks you something",
			titlePrefix: "Title prefix",
			titlePrefixHint: "Prefix added to every notification title; empty for none"
		};
		//#endregion
		//#region src/client/index.ts
		/**
		* dsh-notify-plugin browser half: registers the notify configuration card into
		* DSH's Settings → 插件配置 section (`settings.plugin.item` slot).
		*
		* The entry is built by tsdown into the DSH `window.__ModuleLoader__.load`
		* closure-factory bundle at client/client.js. It departs from the DSH-internal
		* card pattern only in that it types the injected `settingsScope` service
		* structurally (scope.ts) rather than importing `dsh-client-ui-settings` /
		* `dsh-client-runtime`, whose published packages are not installable outside
		* the DSH monorepo. The host in practice already serves the `notify` namespace
		* (it lists it in its WEB_SETTINGS_NAMESPACES allowlist) and injects the
		* `settingsScope` service because this entry declares it in `dsh.client.inject`.
		*/
		/** Dictionary namespace owned by this card. */
		const NS = "settings.notify";
		/** The settings namespace this card edits. */
		const NAMESPACE = "notify";
		const name = "dsh-notify-plugin";
		/** Required services this card injects (host-provided cordis services). */
		const inject = [
			"slots",
			"locale",
			"settingsScope"
		];
		/** Mount the notify card into the plugin configuration section. */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "notify: card dictionaries");
			const t = ctx.locale.bind(NS);
			const controller = new NotifyCardController(ctx.settingsScope.bind({ namespace: NAMESPACE }));
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				id: "notify",
				order: 30,
				label: () => t("notifyTitle"),
				inject: () => ({
					hooks: { notifyCard: {
						getSnapshot: () => controller.getSnapshot(),
						subscribe: (listener) => controller.subscribe(listener)
					} },
					...controller.actions()
				})
			}, NotifyCard));
		}
		//#endregion
		exports.NAMESPACE = NAMESPACE;
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map