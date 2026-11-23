declare module '@dragdroptouch/drag-drop-touch' {
  /** Translates touch gestures into HTML5 drag-and-drop events for `draggable` elements under the given roots. */
  export function enableDragDropTouch(dragRoot?: Document | Element, dropRoot?: Document | Element, options?: { forceListen?: boolean }): void
}
