import { rmSync } from 'fs'
import type { AnalysisResult, JobSpec, JobUpdate, ToolId } from '../shared/types'
import type { RunHandle } from './ffmpeg/run'

export interface JobContext {
  spec: JobSpec
  /** 回報進度(0–1)等部分更新 */
  report: (patch: Omit<JobUpdate, 'jobId' | 'itemId'>) => void
  /** 註冊當前 ffmpeg 子程序,供取消 */
  register: (h: RunHandle) => void
  isCancelled: () => boolean
  /** 登記輸出檔;失敗/取消時由佇列統一刪除殘檔 */
  trackOutput: (path: string) => void
}

export interface ToolResult {
  outputs: string[]
  analysis?: AnalysisResult
}

export type ToolRunner = (ctx: JobContext) => Promise<ToolResult>

const runners = new Map<ToolId, ToolRunner>()

export function registerTool(id: ToolId, runner: ToolRunner): void {
  runners.set(id, runner)
}

interface RunningJob {
  spec: JobSpec
  handle: RunHandle | null
  cancelled: boolean
  trackedOutputs: string[]
}

type OnUpdate = (u: JobUpdate) => void

class JobQueue {
  private concurrency = 3
  private pending: JobSpec[] = []
  private running = new Map<string, RunningJob>()
  private onUpdate: OnUpdate = () => {}

  setOnUpdate(cb: OnUpdate): void {
    this.onUpdate = cb
  }

  setConcurrency(n: number): void {
    this.concurrency = Math.min(6, Math.max(1, n))
    this.pump()
  }

  enqueue(specs: JobSpec[]): void {
    for (const spec of specs) {
      this.pending.push(spec)
      this.onUpdate({ jobId: spec.jobId, itemId: spec.itemId, status: 'waiting', progress: 0 })
    }
    this.pump()
  }

  cancel(jobId: string): void {
    const idx = this.pending.findIndex((s) => s.jobId === jobId)
    if (idx >= 0) {
      const [spec] = this.pending.splice(idx, 1)
      this.onUpdate({ jobId: spec.jobId, itemId: spec.itemId, status: 'cancelled' })
      return
    }
    const job = this.running.get(jobId)
    if (job) {
      job.cancelled = true
      job.handle?.cancel()
    }
  }

  cancelAll(): void {
    for (const spec of this.pending.splice(0)) {
      this.onUpdate({ jobId: spec.jobId, itemId: spec.itemId, status: 'cancelled' })
    }
    for (const job of this.running.values()) {
      job.cancelled = true
      job.handle?.cancel()
    }
  }

  hasActiveWork(): boolean {
    return this.pending.length > 0 || this.running.size > 0
  }

  private pump(): void {
    while (this.running.size < this.concurrency && this.pending.length > 0) {
      const spec = this.pending.shift()!
      void this.execute(spec)
    }
  }

  private async execute(spec: JobSpec): Promise<void> {
    const runner = runners.get(spec.tool)
    const job: RunningJob = { spec, handle: null, cancelled: false, trackedOutputs: [] }
    this.running.set(spec.jobId, job)
    this.onUpdate({ jobId: spec.jobId, itemId: spec.itemId, status: 'running', progress: 0 })

    const ctx: JobContext = {
      spec,
      report: (patch) => this.onUpdate({ jobId: spec.jobId, itemId: spec.itemId, ...patch }),
      register: (h) => {
        job.handle = h
        if (job.cancelled) h.cancel()
      },
      isCancelled: () => job.cancelled,
      trackOutput: (p) => job.trackedOutputs.push(p)
    }

    try {
      if (!runner) throw new Error(`No runner for tool: ${spec.tool}`)
      const result = await runner(ctx)
      if (job.cancelled) throw new CancelledError()
      this.onUpdate({
        jobId: spec.jobId,
        itemId: spec.itemId,
        status: 'done',
        progress: 1,
        outputs: result.outputs,
        analysis: result.analysis
      })
    } catch (err) {
      // 失敗或取消:刪除殘缺輸出檔
      for (const p of job.trackedOutputs) {
        try {
          rmSync(p, { force: true })
        } catch {
          /* 殘檔刪除失敗略過 */
        }
      }
      if (job.cancelled || err instanceof CancelledError) {
        this.onUpdate({ jobId: spec.jobId, itemId: spec.itemId, status: 'cancelled' })
      } else {
        this.onUpdate({
          jobId: spec.jobId,
          itemId: spec.itemId,
          status: 'failed',
          errorTail: err instanceof Error ? err.message : String(err)
        })
      }
    } finally {
      this.running.delete(spec.jobId)
      this.pump()
    }
  }
}

export class CancelledError extends Error {
  constructor() {
    super('cancelled')
  }
}

/** 工具實作用:ffmpeg 非零退出時丟出,訊息帶 stderr 尾段 */
export class FFmpegError extends Error {
  constructor(stderrTail: string) {
    super(stderrTail.trim() || 'ffmpeg failed')
  }
}

export const queue = new JobQueue()
