import { useApp, isMixCardComplete } from '../store'
import { useT } from '../hooks/useT'
import { mergedParams } from '../features/params'
import type { JobSpec, ToolId } from '../../../shared/types'
import { IconPlay } from './icons'

let jobSeq = 1

export function StatusBar(): React.JSX.Element {
  const t = useT()
  const tool = useApp((s) => s.tool)
  const source = useApp((s) => s.source)
  const settings = useApp((s) => s.settings)
  const hardware = useApp((s) => s.hardware)
  const saveSettings = useApp((s) => s.saveSettings)
  const startJobs = useApp((s) => s.startJobs)
  const cancelAll = useApp((s) => s.cancelAll)
  const toast = useApp((s) => s.toast)
  const replaceAudio = useApp((s) => s.replaceAudio)

  const checked = source.filter((it) => it.checked && it.info)
  const anyRunning = source.some((it) => it.status === 'waiting' || it.status === 'running')

  const start = (): void => {
    if (!settings) return

    // 混音:每張完整的混音卡(有湯底 + 至少一個材料)各自是一個獨立 job,
    // 跟其他功能不同,不吃 source 的勾選狀態(卡片本身就是選取單位)
    if (tool === 'mixdown') {
      const cards = useApp.getState().mixCards.filter(isMixCardComplete)
      if (cards.length === 0) {
        toast(t('toast.noMixCards'))
        return
      }
      const pathToItemId = new Map(source.map((it) => [it.path, it.id]))
      for (const c of cards) {
        const spec: JobSpec = {
          jobId: `j${Date.now()}-${jobSeq++}`,
          itemId: `mix-${c.id}`,
          tool,
          path: c.base!.path,
          params: {
            base: c.base,
            ingredients: c.ingredients,
            autoLevel: c.autoLevel,
            limiter: c.limiter,
            duration: c.duration,
            format: c.format,
            sampleRate: c.sampleRate
          }
        }
        // 涉及的每個來源檔都跟著顯示狀態/進度,不只湯底那一列
        const paths = new Set([c.base!.path, ...c.ingredients.map((i) => i.path)])
        const groupIds = [...paths]
          .map((p) => pathToItemId.get(p))
          .filter((x): x is string => Boolean(x))
        void startJobs([spec], groupIds)
      }
      toast(t('toast.jobsStarted', { n: cards.length }))
      return
    }

    if (checked.length === 0) {
      toast(t('toast.noChecked'))
      return
    }

    const params = mergedParams<Record<string, unknown>>(
      tool as Exclude<ToolId, 'mixdown'>,
      settings.toolParams
    )
    let candidates = checked

    if (tool === 'replace') {
      candidates = checked.filter((it) => it.info!.hasVideo)
      const audioValid = replaceAudio && source.some((it) => it.path === replaceAudio)
      if (candidates.length === 0 || !audioValid) {
        toast(t('param.replace.needAudio'))
        return
      }
    }
    if (tool === 'extract' || tool === 'analysis' || tool === 'normalize' || tool === 'convert') {
      candidates = checked.filter((it) => it.info!.audioStreams.length > 0)
    }

    // 分析:逐檔的軌選擇來自卡片(analysisTracks);未選任何軌的檔案跳過
    if (tool === 'analysis') {
      if ((settings.analysisMetrics?.length ?? 0) === 0) {
        toast(t('toast.noMetrics'))
        return
      }
      const analysisTracks = useApp.getState().analysisTracks
      const specs: JobSpec[] = []
      for (const it of candidates) {
        const all = it.info!.audioStreams.map((_, i) => i)
        const tracks = analysisTracks[it.path] ?? all
        if (tracks.length === 0) continue
        specs.push({
          jobId: `j${Date.now()}-${jobSeq++}`,
          itemId: it.id,
          tool,
          path: it.path,
          params: { ...params, tracks }
        })
      }
      if (specs.length === 0) {
        toast(t('toast.noChecked'))
        return
      }
      void startJobs(specs)
      toast(t('toast.jobsStarted', { n: specs.length }))
      return
    }

    if (candidates.length === 0) {
      toast(t('toast.noChecked'))
      return
    }

    const specs: JobSpec[] = candidates.map((it) => ({
      jobId: `j${Date.now()}-${jobSeq++}`,
      itemId: it.id,
      tool,
      path: it.path,
      params: { ...params, replaceAudioPath: replaceAudio }
    }))
    void startJobs(specs)
    toast(t('toast.jobsStarted', { n: specs.length }))
  }

  return (
    <footer className="statusbar">
      <span className="statusbar-info">
        {t('statusbar.filesSelected', { sel: checked.length, total: source.length })}
      </span>
      <span className="statusbar-hw" title={hardware?.gpuNames.join(', ') ?? ''}>
        {hardware?.chosenEncoder && settings?.hwAccel !== 'off'
          ? t('statusbar.hwOn', { name: hardware.chosenEncoder })
          : t('statusbar.hwOff')}
      </span>
      <label className="statusbar-conc">
        {t('statusbar.concurrency')}
        <select
          value={settings?.concurrency ?? 3}
          onChange={(e) => void saveSettings({ concurrency: Number(e.target.value) })}
        >
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
      {anyRunning && (
        <button className="mini-btn danger" onClick={cancelAll}>
          {t('common.cancelAll')}
        </button>
      )}
      <button className="start-btn" onClick={start}>
        <IconPlay /> {t('common.start')}
      </button>
    </footer>
  )
}
