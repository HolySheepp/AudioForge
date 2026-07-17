import { registerTool } from '../queue'
import { analysisRunner } from './analysis'
import { normalizeRunner } from './normalize'
import { replaceRunner } from './replace'
import { extractRunner } from './extract'
import { convertRunner } from './convert'
import { multitrackRunner } from './multitrack'
import { mixdownRunner } from './mixdown'

export function registerAllTools(): void {
  registerTool('mixdown', mixdownRunner)
  registerTool('analysis', analysisRunner)
  registerTool('normalize', normalizeRunner)
  registerTool('replace', replaceRunner)
  registerTool('extract', extractRunner)
  registerTool('convert', convertRunner)
  registerTool('multitrack', multitrackRunner)
}
