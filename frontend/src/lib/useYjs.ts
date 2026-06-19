"use client"

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import * as Y from "yjs"
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from "y-protocols/awareness"
import type { SocketEvent } from "./useProjectSocket"

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function applyDiff(yText: Y.Text, oldStr: string, newStr: string) {
  let start = 0
  while (start < oldStr.length && start < newStr.length && oldStr[start] === newStr[start]) start++

  let oldEnd = oldStr.length
  let newEnd = newStr.length
  while (oldEnd > start && newEnd > start && oldStr[oldEnd - 1] === newStr[newEnd - 1]) {
    oldEnd--
    newEnd--
  }

  yText.doc!.transact(() => {
    if (oldEnd > start) yText.delete(start, oldEnd - start)
    if (newEnd > start) yText.insert(start, newStr.slice(start, newEnd))
  })
}

export interface CursorPeer {
  userId: string
  position: number
}

interface AwarenessState {
  cursor: { relPos: Record<string, unknown>; index: number } | null
  userId: string
}

interface UseYjsOptions {
  taskId: string
  initialContent: string
  userId: string
  enabled: boolean
  sendRaw: (msg: object) => void
  onRegisterYjsHandler: (handler: ((e: SocketEvent) => void) | null) => void
  textareaRef?: RefObject<HTMLTextAreaElement | null>
}

export function useYjs({ taskId, initialContent, userId, enabled, sendRaw, onRegisterYjsHandler, textareaRef }: UseYjsOptions) {
  const docRef = useRef<Y.Doc | null>(null)
  const yTextRef = useRef<Y.Text | null>(null)
  const awarenessRef = useRef<Awareness | null>(null)
  const applyingRemote = useRef(false)
  const syncedRef = useRef(false)
  const [content, setContent] = useState(initialContent)
  const [cursorPeers, setCursorPeers] = useState<CursorPeer[]>([])
  const enabledRef = useRef(enabled)
  useEffect(() => { enabledRef.current = enabled }, [enabled])

  useEffect(() => {
    if (!enabled) awarenessRef.current?.setLocalStateField("cursor", null)
  }, [enabled])

  useEffect(() => {
    syncedRef.current = false
    const doc = new Y.Doc()
    const yText = doc.getText("description")
    const awareness = new Awareness(doc)
    docRef.current = doc
    yTextRef.current = yText
    awarenessRef.current = awareness

    awareness.setLocalState({ cursor: null, userId } as AwarenessState)

    const recalcPeers = () => {
      const states = awareness.getStates() as Map<number, AwarenessState>
      const peers: CursorPeer[] = []
      for (const [clientId, state] of states) {
        if (clientId === awareness.clientID) continue
        if (!state?.cursor || !state.userId) continue
        const relPos = Y.createRelativePositionFromJSON(state.cursor.relPos)
        const absPos = Y.createAbsolutePositionFromRelativePosition(relPos, doc)
        // null when anchored item hasn't arrived yet; fall back to sender's raw index
        const position = absPos !== null ? absPos.index : state.cursor.index
        peers.push({ userId: state.userId, position })
      }
      setCursorPeers(peers)
    }

    awareness.on("change", recalcPeers)

    // 'remote' origin prevents echoing back server-forwarded updates
    const onAwarenessUpdate = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (origin === "remote") return
      const changed = [...added, ...updated, ...removed]
      const encoded = encodeAwarenessUpdate(awareness, changed)
      sendRaw({ type: "awareness.update", taskId, update: uint8ToBase64(encoded) })
    }
    awareness.on("update", onAwarenessUpdate)

    yText.observe(() => {
      // React resets the caret when it re-renders a controlled textarea; save/restore before setContent fires
      if (applyingRemote.current) {
        const el = textareaRef?.current
        if (el && document.activeElement === el) {
          const savedStart = el.selectionStart
          const savedEnd = el.selectionEnd
          requestAnimationFrame(() => {
            if (el && document.activeElement === el) {
              el.selectionStart = savedStart
              el.selectionEnd = savedEnd
            }
          })
        }
      }
      setContent(yText.toString())
      // awareness doesn't fire on text edits — re-resolve cursors so they track the new doc state
      recalcPeers()
    })

    onRegisterYjsHandler((event: SocketEvent) => {
      if (event.type === "yjs.sync.init" && event.taskId === taskId) {
        applyingRemote.current = true
        Y.applyUpdate(doc, base64ToUint8(event.state))
        applyingRemote.current = false
        syncedRef.current = true
      } else if (event.type === "yjs.update" && event.taskId === taskId) {
        applyingRemote.current = true
        Y.applyUpdate(doc, base64ToUint8(event.update))
        applyingRemote.current = false
      } else if (event.type === "awareness.update" && event.taskId === taskId) {
        // origin='remote' so the update handler doesn't re-broadcast
        applyAwarenessUpdate(awareness, base64ToUint8(event.update), "remote")
      } else if (event.type === "presence.updated" && event.taskId === taskId) {
        // re-broadcast so new joiners see our cursor immediately without a keypress
        const encoded = encodeAwarenessUpdate(awareness, [awareness.clientID])
        sendRaw({ type: "awareness.update", taskId, update: uint8ToBase64(encoded) })
      }
    })

    sendRaw({ type: "yjs.sync.request", taskId })

    return () => {
      onRegisterYjsHandler(null)
      awareness.destroy()
      doc.destroy()
      awarenessRef.current = null
      docRef.current = null
      yTextRef.current = null
    }
  }, [taskId]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyAndBroadcast = useCallback((newValue: string) => {
    if (!syncedRef.current) return
    const yText = yTextRef.current
    const doc = docRef.current
    if (!yText || !doc) return
    const oldStr = yText.toString()
    if (oldStr === newValue) return
    const prevStateVec = Y.encodeStateVector(doc)
    applyDiff(yText, oldStr, newValue)
    if (!applyingRemote.current) {
      const diff = Y.encodeStateAsUpdate(doc, prevStateVec)
      sendRaw({ type: "yjs.update", taskId, update: uint8ToBase64(diff) })
    }
  }, [taskId, sendRaw])

  const onChange = useCallback((newValue: string) => {
    if (!enabledRef.current) return
    if (!syncedRef.current) { setContent(newValue); return }
    applyAndBroadcast(newValue)
  }, [applyAndBroadcast])

  const revertContent = useCallback((savedValue: string) => {
    applyAndBroadcast(savedValue)
  }, [applyAndBroadcast])

  const onCursorMove = useCallback((position: number) => {
    if (!enabledRef.current) return
    const yText = yTextRef.current
    const awareness = awarenessRef.current
    if (!yText || !awareness) return
    const relPos = Y.createRelativePositionFromTypeIndex(yText, position)
    // index alongside relPos prevents equality-check suppression at end-of-text
    // (relPos is always { item: null } there, causing awareness to drop the update)
    awareness.setLocalStateField("cursor", { relPos: Y.relativePositionToJSON(relPos), index: position })
  }, [])

  return { content, onChange, onCursorMove, cursorPeers: enabled ? cursorPeers : [], revertContent }
}
