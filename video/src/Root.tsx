import { Composition } from 'remotion'
import { Opening } from './Opening'
import { OpeningCalm } from './OpeningCalm'

/** 视频规格：1080p、60 帧，和 OBS 录的真实界面片段一致，剪辑时不用转换 */
export const FPS = 60

export function Root(): React.JSX.Element {
  return (
    <>
      <Composition id="Opening" component={Opening} durationInFrames={Math.round(4.8 * FPS)} fps={FPS} width={1920} height={1080} />
      {/* 第一版，偏安静，留作对照 */}
      <Composition id="OpeningCalm" component={OpeningCalm} durationInFrames={6 * FPS} fps={FPS} width={1920} height={1080} />
    </>
  )
}
