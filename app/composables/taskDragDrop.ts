import Sortable from 'sortablejs'
import type { MaybeRefOrGetter } from 'vue'

export interface TaskMove {
  taskId: number
  statusId: number
  /** Visible neighbours after the drop; the page turns them into a position within the full column. */
  prevId: number | null
  nextId: number | null
}

interface Options {
  /** Sortable group: containers sharing it can exchange items (board columns, list groups). */
  group: string
  disabled: MaybeRefOrGetter<boolean>
  /** Restrict dragging to an element inside the item (list rows), or drag the whole item (board cards). */
  handle?: string
  classes?: { ghost?: string; chosen?: string; drag?: string }
  onMove: (move: TaskMove) => void
  onDrag?: (taskId: number | null) => void
}

/**
 * Drag and drop of `[data-task-id]` items between containers carrying `data-status-id`.
 *
 * Sortable moves DOM nodes itself; on drop we put the node back where Vue rendered it and report the move, so the
 * state change re-renders the item in its new place and Vue's virtual DOM never goes out of sync.
 */
export function useTaskDragDrop(options: Options) {
  const containers = new Map<number, HTMLElement>()
  const sortables = new Map<number, { el: HTMLElement; sortable: Sortable }>()
  let origin: { parent: Node; next: Node | null } | null = null
  let lastDragEnd = 0

  function neighbour(el: Element, direction: 'previousElementSibling' | 'nextElementSibling') {
    let node = el[direction]
    while (node && !(node instanceof HTMLElement && node.dataset.taskId)) node = node[direction]
    return node instanceof HTMLElement ? Number(node.dataset.taskId) : null
  }

  function create(el: HTMLElement) {
    return Sortable.create(el, {
      group: options.group,
      draggable: '[data-task-id]',
      handle: options.handle,
      animation: 150,
      // Pointer-event fallback: identical behaviour for mouse and touch, and styled drag previews.
      forceFallback: true,
      fallbackTolerance: 4,
      fallbackOnBody: true,
      delay: options.handle ? 0 : 180,
      delayOnTouchOnly: true,
      disabled: toValue(options.disabled),
      ghostClass: options.classes?.ghost,
      chosenClass: options.classes?.chosen,
      dragClass: options.classes?.drag,
      scrollSensitivity: 80,
      onChoose(evt) {
        origin = { parent: evt.item.parentNode!, next: evt.item.nextSibling }
      },
      onStart(evt) {
        options.onDrag?.(Number(evt.item.dataset.taskId))
      },
      onEnd(evt) {
        lastDragEnd = Date.now()
        const item = evt.item
        const move: TaskMove = {
          taskId: Number(item.dataset.taskId),
          statusId: Number((evt.to as HTMLElement).dataset.statusId),
          prevId: neighbour(item, 'previousElementSibling'),
          nextId: neighbour(item, 'nextElementSibling'),
        }
        if (origin) origin.parent.insertBefore(item, origin.next)
        origin = null
        options.onDrag?.(null)
        if (evt.from === evt.to && evt.oldIndex === evt.newIndex) return
        options.onMove(move)
      },
    })
  }

  function sync() {
    for (const [id, entry] of sortables) {
      if (containers.get(id) !== entry.el) {
        entry.sortable.destroy()
        sortables.delete(id)
      }
    }
    for (const [id, el] of containers) {
      const entry = sortables.get(id)
      if (entry) entry.sortable.option('disabled', toValue(options.disabled))
      else sortables.set(id, { el, sortable: create(el) })
    }
  }

  /** Template ref callback for a container: `:ref="(el) => setContainer(status.id, el)"`. */
  function setContainer(statusId: number, el: unknown) {
    if (el instanceof HTMLElement) containers.set(statusId, el)
    else containers.delete(statusId)
  }

  onMounted(sync)
  onUpdated(sync)
  watch(() => toValue(options.disabled), sync)
  onBeforeUnmount(() => {
    for (const { sortable } of sortables.values()) sortable.destroy()
    sortables.clear()
  })

  return {
    setContainer,
    /** True right after a drop, so the click that ends a drag does not also open the task. */
    justDropped: () => Date.now() - lastDragEnd < 250,
  }
}
