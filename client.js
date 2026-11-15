/**
 * Client half of the "delete session" bundle.
 *
 * Registers one danger row in a Session's context menu (the sidebar row's "..."
 * and right-click share that menu), then renders a confirmation dialog from the
 * root overlay. The dialog posts to the Host half's Fetch route; on success the
 * Host has already detached the Session from every Workspace account, so the
 * sidebar row disappears through the normal Workspace follow.
 *
 * @module @local/session-delete/client
 */
window.__ModuleLoader__.load({
  id: '@local/session-delete',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState, useSyncExternalStore } = React

    /** Pending confirmation target: `{ sessionId, title, isCurrent }`, or null. */
    let pending = null
    const listeners = new Set()
    const store = {
      get: () => pending,
      set(next) {
        pending = next
        for (const listener of [...listeners]) listener()
      },
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }

    const CSS = `
.sd-root{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px;pointer-events:auto}
.sd-mask{position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.32));backdrop-filter:var(--dsw-mask-blur,blur(2px))}
.sd-dialog{position:relative;z-index:1;box-sizing:border-box;display:flex;flex-direction:column;gap:20px;width:min(440px,100%);max-height:100%;padding:0 0 24px;overflow:hidden;border:0;border-radius:var(--dsw-radius-panel,16px);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent,0 12px 40px rgba(0,0,0,.28));color:var(--dsw-alias-label-primary);outline:none}
.sd-content{display:flex;flex-direction:column;width:100%;min-height:0;overflow-y:auto;overscroll-behavior:contain}
.sd-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:22px 14px 12px 24px}
.sd-title{margin:0;font-size:16px;line-height:24px;font-weight:500;color:var(--dsw-alias-label-primary)}
.sd-close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary)}
.sd-close:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-1))}
.sd-description{margin:0;padding:0 24px;font-size:14px;line-height:22px;font-weight:400;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
.sd-body{display:flex;flex-direction:column;gap:8px;min-width:0;margin-top:20px;padding:0 24px}
.sd-status{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.sd-error{font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}
.sd-footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:0 24px}
.sd-button{box-sizing:border-box;height:32px;min-width:72px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;cursor:pointer}
.sd-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-1))}
.sd-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.sd-button:disabled{opacity:.5;cursor:default}
.sd-danger{min-width:96px;color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.sd-danger:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1)}
`

    const CloseIcon = () =>
      h(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true, fill: 'none' },
        h('path', {
          d: 'M4 4l8 8M12 4l-8 8',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
        }),
      )

    /**
     * Render the component through the Client's locale service.
     * @param {string} prefix
     * @param {(key: string, params?: Record<string, unknown>) => string} t
     * @param {import('@deepseek-ai/cordis').Context} ctx
     */
    function createDialog(prefix, t, ctx) {
      return function SessionDeleteDialog() {
        const target = useSyncExternalStore(store.subscribe, store.get)
        const [busy, setBusy] = useState(false)
        const [error, setError] = useState(null)
        const dialogRef = useRef(null)
        const busyRef = useRef(false)
        const closeRef = useRef(() => {})

        const close = useCallback(() => {
          if (busyRef.current) return
          store.set(null)
        }, [])
        closeRef.current = close

        useEffect(() => {
          if (target === null) return
          setBusy(false)
          busyRef.current = false
          setError(null)
        }, [target])

        useEffect(() => {
          if (target === null) return
          const node = dialogRef.current
          const restore = document.activeElement instanceof HTMLElement ? document.activeElement : null
          const frame = requestAnimationFrame(() => node?.focus())
          const onKeyDown = (event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              closeRef.current()
              return
            }
            if (event.key !== 'Tab' || node === null) return
            const focusable = [...node.querySelectorAll('button:not(:disabled)')]
            if (focusable.length === 0) {
              event.preventDefault()
              node.focus()
              return
            }
            const first = focusable[0]
            const last = focusable[focusable.length - 1]
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault()
              last.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault()
              first.focus()
            }
          }
          document.addEventListener('keydown', onKeyDown, true)
          return () => {
            cancelAnimationFrame(frame)
            document.removeEventListener('keydown', onKeyDown, true)
            restore?.focus?.()
          }
        }, [target])

        if (target === null) return null

        const confirm = async () => {
          if (busyRef.current) return
          busyRef.current = true
          setBusy(true)
          setError(null)
          try {
            const response = await fetch('/api/session-delete', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ sessionId: target.sessionId }),
            })
            const result = await response.json().catch(() => undefined)
            if (response.ok && result?.ok === true) {
              store.set(null)
              if (target.isCurrent) ctx.layout.selectPanel(null)
              return
            }
            setError(
              result?.code === 'running'
                ? t('error.running')
                : typeof result?.message === 'string' && result.message !== ''
                  ? result.message
                  : t('error.failed'),
            )
          } catch {
            setError(t('error.failed'))
          } finally {
            busyRef.current = false
            setBusy(false)
          }
        }

        return ReactDOM.createPortal(
          h(
            'div',
            { className: 'sd-root', role: 'presentation' },
            h('style', null, CSS),
            h('div', { className: 'sd-mask', 'aria-hidden': 'true', onClick: close }),
            h(
              'div',
              {
                ref: dialogRef,
                tabIndex: -1,
                className: 'sd-dialog',
                role: 'dialog',
                'aria-modal': 'true',
                'aria-labelledby': `${prefix}-sd-title`,
                'aria-describedby': `${prefix}-sd-description`,
              },
              h(
                'div',
                { className: 'sd-content' },
                h(
                  'div',
                  { className: 'sd-header' },
                  h('h2', { className: 'sd-title', id: `${prefix}-sd-title` }, t('dialog.title')),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'sd-close',
                      'aria-label': t('dialog.close'),
                      disabled: busy,
                      onClick: close,
                    },
                    h(CloseIcon),
                  ),
                ),
                h(
                  'p',
                  { className: 'sd-description', id: `${prefix}-sd-description` },
                  t('dialog.description', { name: target.title }),
                ),
                h(
                  'div',
                  { className: 'sd-body' },
                  busy ? h('div', { className: 'sd-status', role: 'status' }, t('dialog.pending')) : null,
                  error === null ? null : h('div', { className: 'sd-error', role: 'alert' }, error),
                ),
              ),
              h(
                'div',
                { className: 'sd-footer' },
                h(
                  'button',
                  { type: 'button', className: 'sd-button', disabled: busy, onClick: close },
                  t('dialog.cancel'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'sd-button sd-danger',
                    disabled: busy,
                    onClick: confirm,
                  },
                  t('dialog.confirm'),
                ),
              ),
            ),
          ),
          document.body,
        )
      }
    }

    return {
      inject: ['contextMenus', 'locale', 'slots', 'sessions', 'layout'],
      apply(ctx) {
        const t = ctx.locale.bind('sessionDelete')

        ctx.effect(
          () =>
            ctx.locale.register('sessionDelete', {
              zh: {
                'menu.delete': '删除会话',
                untitled: '未命名的会话',
                'dialog.title': '删除会话',
                'dialog.description': '确定要永久删除“{name}”吗？此操作无法撤销。',
                'dialog.cancel': '取消',
                'dialog.confirm': '删除',
                'dialog.close': '关闭',
                'dialog.pending': '正在删除…',
                'error.running': '该会话正在运行，请先停止后再删除。',
                'error.failed': '删除失败，请重试。',
              },
              en: {
                'menu.delete': 'Delete session',
                untitled: 'Untitled session',
                'dialog.title': 'Delete session',
                'dialog.description': 'Permanently delete “{name}”? This cannot be undone.',
                'dialog.cancel': 'Cancel',
                'dialog.confirm': 'Delete',
                'dialog.close': 'Close',
                'dialog.pending': 'Deleting…',
                'error.running': 'This session is running. Stop it before deleting.',
                'error.failed': 'Could not delete the session. Try again.',
              },
            }),
          'session-delete: locale',
        )

        const Dialog = createDialog('session-delete', t, ctx)

        ctx.effect(
          () =>
            ctx.contextMenus.register({
              id: 'session.delete',
              target: 'session',
              order: 700,
              observe: () => [ctx.locale],
              resolve: (target) => {
                if (typeof target?.sessionId !== 'string' || target.sessionId === '') return []
                return [
                  {
                    id: 'delete',
                    label: t('menu.delete'),
                    // Reuse the shipped Workspace-delete trash glyph (red through `danger`)
                    // so the menu's icon style stays identical to the other rows.
                    icon: { key: 'workspace.delete' },
                    danger: true,
                    separatorBefore: true,
                    afterContent: true,
                    run: () => {
                      const info = ctx.sessions?.retainInfo?.(target.sessionId)?.getSnapshot?.()
                      store.set({
                        sessionId: target.sessionId,
                        title: target.displayTitle || t('untitled'),
                        isCurrent: (info?.retainedBy?.mainView ?? 0) > 0,
                      })
                    },
                  },
                ]
              },
            }),
          'session-delete: context menu',
        )

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'session-delete-dialog', order: 1000 },
            Dialog,
          ),
        )
      },
    }
  },
})
