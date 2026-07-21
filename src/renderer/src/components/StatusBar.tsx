import { useApp } from '../store'
import { useT } from '../hooks/useT'
import { mergedParams } from '../features/params'
import type { JobSpec } from '../../../shared/types'
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
    if (checked.length === 0) {
      toast(t('toast.noChecked'))
      return
    }

    const params = mergedParams<Record<string, unknown>>(tool, settings.toolParams)
    let candidates = checked

    // 混音合併:單一 job 吃整批已勾選的音訊檔
    if (tool === 'mixdown') {
      const audios = checked.filter((it) => !it.info!.hasVideo && it.info!.audioStreams.length > 0)
      if (audios.length < 2) {
        toast(t('toast.needTwoAudio'))
        return
      }
      const spec: JobSpec = {
        jobId: `j${Date.now()}-${jobSeq++}`,
        itemId: audios[0].id,
        tool,
        path: audios[0].path,
        params: { ...params, inputPaths: audios.map((a) => a.path) }
      }
      void startJobs([spec], audios.map((a) => a.id))
      toast(t('toast.jobsStarted', { n: 1 }))
      return
    }

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
