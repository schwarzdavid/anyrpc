export function onReady(cb: () => unknown): void {
    if (document.readyState !== 'loading') {
        return void cb()
    }
    document.addEventListener('DOMContentLoaded', () => cb())
}
