import { useEffect, useState } from "react"
import { api } from "@/lib/api"

export function useBlobUrl(attachmentId: string | null): { blobUrl: string | null; loading: boolean } {
  const [state, setState] = useState<{ blobUrl: string | null; loading: boolean }>({
    blobUrl: null,
    loading: !!attachmentId,
  })

  useEffect(() => {
    if (!attachmentId) return
    let cancelled = false
    let url: string | null = null
    api.attachments.fetchBlobUrl(attachmentId)
      .then((u) => {
        if (!cancelled) { url = u; setState({ blobUrl: u, loading: false }) }
        else URL.revokeObjectURL(u)
      })
      .catch(() => { if (!cancelled) setState({ blobUrl: null, loading: false }) })
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [attachmentId])

  return state
}
