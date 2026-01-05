import { html, reactive } from "./arrow.mjs";

const state = reactive({
  toasts: []
});

export function showToast(message, type = "success", duration = 3000) {
  const id = Date.now();
  state.toasts.push({ id, message, type });

  setTimeout(() => {
    state.toasts = state.toasts.filter(t => t.id !== id);
  }, duration);
}

html`
  <div class="toast-container">
    ${() => state.toasts.map(t =>
  html`
        <div class="toast ${t.type} show" @click="${() => state.toasts = state.toasts.filter(t => t.id !== t.id)}">
          <span class="icon">${t.type === "success" ? "✔" : "✖"}</span>
          <span class="message">${t.message}</span>
        </div>
      `.key(t.id)
)}
  </div>
`(document.body);

const style = document.createElement("style");
style.textContent = `
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 9999;
  font-family: "Segoe UI", Arial, sans-serif;
}
.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 220px;
  max-width: 300px;
  padding: 12px 16px;
  border-radius: 12px;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-toast);
  opacity: 0;
  transform: translateX(100%);
  transition: all 0.4s ease;
}
.toast.show {
  opacity: 1;
  transform: translateX(0);
}
.toast.success {
  border-left: 5px solid var(--toast-success-border);
  background: var(--toast-success-bg);
}
.toast.error {
  border-left: 5px solid var(--toast-error-border);
  background: var(--toast-error-bg);
}
.toast .icon {
  font-size: 16px;
  font-weight: bold;
  color: inherit;
}
.toast.success .icon {
  color: var(--toast-success-icon);
}
.toast.error .icon {
  color: var(--toast-error-icon);
}
.toast .message {
  flex: 1;
  line-height: 1.4;
}
`;
document.head.appendChild(style);
