/**
 * Touch screens do not fire HTML5 drag-and-drop events. The calendar reschedules by dragging `draggable` chips, so on
 * touch devices translate touch gestures into those events. (Board and list use Sortable's pointer events instead.)
 */
export default defineNuxtPlugin(async () => {
  if (!('ontouchstart' in window) && navigator.maxTouchPoints === 0) return
  const { enableDragDropTouch } = await import('@dragdroptouch/drag-drop-touch')
  enableDragDropTouch()
})
