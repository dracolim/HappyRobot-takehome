import { BoardView } from "@/components/board/BoardView"

export default function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  return <BoardView paramsPromise={params} />
}
