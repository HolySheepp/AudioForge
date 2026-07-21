export const zh = {
  // 通用
  'app.name': 'AudioForge',
  'common.start': '開始處理',
  'common.cancel': '取消',
  'common.save': '保存',
  'common.cancelAll': '全部取消',
  'common.close': '關閉',
  'common.confirm': '確認',
  'common.browse': '瀏覽…',
  'common.none': '無',

  // 側欄功能
  'tool.analysis': '響度分析',
  'tool.analysis.desc': '測量 LUFS / LU / True Peak',
  'tool.normalize': '響度標準化',
  'tool.normalize.desc': '兩段式 loudnorm,不破壞動態',
  'tool.replace': '音軌替換',
  'tool.replace.desc': '替換影片音軌,畫面不重編',
  'tool.extract': '抽取音軌',
  'tool.extract.desc': '預設無損取出音軌',
  'tool.convert': '音訊轉檔',
  'tool.convert.desc': 'WAV / MP3 / AAC / FLAC',
  'tool.mixdown': '混音合併',
  'tool.mixdown.desc': '把多個音訊混成單一音軌',

  // 來源欄
  'source.title': '來源檔案',
  'source.multitrackExclusive': '多軌檔案需單獨處理,勾選它會取消其他檔案',
  'source.selectAll': '全選',
  'source.selectNone': '全不選',
  'source.clearAll': '清除全部',
  'source.empty': '把檔案或資料夾拖到這裡',
  'source.remove': '移除',
  'source.probing': '讀取中…',
  'source.checkedCount': '已勾選 {n} 個檔案',

  // 已處理欄
  'processed.title': '已處理',
  'processed.empty': '完成的輸出檔會出現在這裡',
  'processed.moveToSource': '移至來源',
  'processed.moveAllToSource': '全部移至來源',
  'processed.clear': '清空清單',
  'processed.openFolder': '開啟所在資料夾',

  // 狀態
  'status.waiting': '等待',
  'status.running': '處理中',
  'status.done': '完成',
  'status.failed': '失敗',
  'status.cancelled': '已取消',
  'status.viewError': '查看錯誤',
  'status.errorTitle': 'FFmpeg 錯誤輸出(尾段)',

  // 狀態列
  'statusbar.concurrency': '同時處理',
  'statusbar.hwOn': '硬體加速:{name}',
  'statusbar.hwOff': '硬體加速:關',
  'statusbar.filesSelected': '{sel} / {total} 已勾選',

  // 參數:標準化
  'param.targetLufs': '目標響度',
  'param.targetTp': 'True Peak 上限',
  'param.preset.streaming': '-14 LUFS / -1 dBTP(串流平台)',

  // 參數:替換
  'param.replace.audioFile': '新音軌檔案',
  'param.replace.useAsAudio': '設為新音軌',
  'param.replace.length': '長度處理',
  'param.replace.keepVideo': '保留完整影片(音訊補靜音)',
  'param.replace.shortest': '以較短者為準',
  'param.replace.target': '要替換的音軌',
  'param.replace.targetAll': '全部替換',
  'param.replace.codec': '音訊編碼',
  'param.replace.needAudio': '勾選影片後,點選一個音訊作為新音軌',

  // 參數:混音合併
  'param.mixdown.duration': '輸出長度',
  'param.mixdown.duration.longest': '以最長的輸入為準',
  'param.mixdown.duration.shortest': '以最短的輸入為準',
  'param.mixdown.autoLevel': '自動平衡音量',
  'toast.needTwoAudio': '請勾選至少兩個音訊檔',

  // 參數:抽取
  'param.extract.mode': '輸出格式',
  'param.extract.lossless': '原格式無損(stream copy)',

  // 參數:轉檔
  'param.convert.format': '輸出格式',
  'param.convert.bitDepth': '位元深度',
  'param.convert.sampleRate': '取樣率',
  'param.convert.keepSr': '保持原始',
  'param.convert.bitrate': '位元率',
  'param.convert.channels': '聲道',
  'param.convert.keepCh': '保持原始',
  'param.convert.stereo': '立體聲',
  'param.convert.mono': '單聲道',
  'param.convert.mp3Mode': 'MP3 模式',

  // 參數:逐軌
  'param.track': '音軌 {n}',
  'param.tracks': '音軌',
  'param.mt.action': '處理方式',
  'param.mt.actionNormalize': '標準化',
  'param.mt.actionKeep': '保持原樣',
  'param.mt.actionExclude': '排除',
  'param.mt.output': '輸出模式',
  'param.mt.outputMix': '混音為單一立體聲軌',
  'param.mt.outputSeparate': '保留多軌',
  'param.mt.limiter': '混音後保險限制器',

  // 分析結果
  'analysis.integrated': '整體響度',
  'analysis.range': '響度範圍',
  'analysis.truePeak': 'True Peak',
  'analysis.copyTable': '複製結果表',
  'analysis.pinLabel': '釘選到來源列',
  'analysis.empty': '勾選來源檔案後,可分析的音軌會列在這裡',
  'analysis.notAnalyzed': '尚未分析',
  'metric.lufs': '響度',
  'metric.lra': '響度範圍',
  'metric.truePeak': 'True Peak',
  'metric.plr': '動態(PLR)',
  'metric.crest': '波峰因數',
  'analysis.copied': '已複製到剪貼簿',

  // 視窗控制
  'window.minimize': '最小化',
  'window.maximize': '最大化',
  'window.restore': '還原',
  'window.close': '關閉',

  // 設定
  'settings.title': '設定',
  'settings.tab.general': '一般',
  'settings.tab.appearance': '外觀與音效',
  'settings.tab.haptics': '觸覺回饋',
  'settings.tab.hardware': '硬體',
  'settings.tab.analysis': '響度分析',
  'settings.analysis.metrics': '要分析的指標',
  'settings.analysis.extraPass': '需額外測量',
  'settings.analysis.hint': '勾選越多分析越慢;標「需額外測量」的指標會多讀一次檔案',
  'settings.output': '輸出位置',
  'settings.output.source': '與來源相同資料夾',
  'settings.output.fixed': '固定資料夾',
  'settings.concurrency': '同時處理數',
  'settings.theme': '主題',
  'settings.theme.system': '跟隨系統',
  'settings.theme.light': '淺色',
  'settings.theme.dark': '深色',
  'settings.language': '語言',
  'settings.hwAccel': '硬體加速',
  'settings.hwAccel.auto': '自動',
  'settings.hwAccel.off': '停用',
  'settings.accent': '副色',
  'settings.accent.blue': '藍',
  'settings.accent.green': '綠',
  'settings.accent.purple': '紫',
  'settings.accent.teal': '青',
  'settings.accent.amber': '琥珀',
  'settings.accent.rose': '玫瑰',
  'settings.accent.custom': '自訂顏色',
  'settings.accent.save': '保存',
  'settings.accent.deleteHint': '右鍵刪除',
  'settings.accent.customHint': '自訂顏色(右鍵刪除)',
  'toast.customFull': '自訂副色最多保存 5 個',

  'settings.sound.pick': '音效',
  'settings.sound.test': '試聽',
  'settings.sound.noneOption': '無',
  'settings.sound.empty': '(找不到音效檔)',
  'settings.sound.timing': '播放時機',
  'settings.sound.timing.perFile': '每個檔案完成',
  'settings.sound.timing.batch': '全部完成才播放',
  'settings.sound.credit': '由衷感謝由 SoundShelfStudio 製作的免費音效',

  'settings.haptics': '旋鈕觸覺回饋',
  'settings.haptics.hint': '需要 MX Master 4 滑鼠 + Logi Options+ 的 HapticWeb 外掛',
  'settings.haptics.waveform': '觸覺波形 (0–15)',
  'settings.haptics.test': '測試震動',
  'settings.haptics.tryKnob': '試轉手感',
  'toast.hapticOk': '已送出測試震動',
  'toast.hapticFail': '未偵測到 HapticWeb 服務(請確認 Logi Options+ 與外掛已啟動)',
  'settings.hwDetected': '偵測到的 GPU',
  'settings.hwEncoder': '使用中的編碼器',
  'settings.hwEncoderNone': '無(使用 CPU)',

  // 預覽
  'preview.title': '預覽',
  'preview.window': '時間軸長度',
  'preview.generating': '產生預覽中…',
  'preview.original': '原音軌',
  'preview.new': '新音軌',
  'preview.noFile': '點選檔案以預覽',
  'preview.unsupported': '無法預覽此檔案',

  // 旋鈕
  'knob.step': '棘輪步進',
  'knob.doubleClickHint': '雙擊輸入數值',

  // 任務註記
  'note.downgradedAac': '容器不相容,音訊已自動改用 AAC 320k',

  // Toast
  'toast.unsupportedFiles': '已略過 {n} 個不支援的檔案',
  'toast.noChecked': '沒有勾選任何檔案',
  'toast.jobsStarted': '已開始 {n} 個任務',
  'toast.confirmQuit': '仍有任務處理中,確定要關閉嗎?',

  // 單位/格式化
  'fmt.tracks': '{n} 軌',
  'fmt.channels.1': '單聲道',
  'fmt.channels.2': '立體聲'
} as const

export type I18nKey = keyof typeof zh
