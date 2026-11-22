import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initAnalytics } from './analytics';
import { loadAudioManifest } from '@atomic/audio';
import './styles.css';

initAnalytics();

// 尽早发起预录音频清单加载（本地小文件，几毫秒级）。
// 不 await render：Vite 的 React refresh preamble 要求同步挂载，延迟 render 会破坏 HMR。
// 用户从看到界面到首次点播放有足够时间让 manifest 就绪；PrerecordedProvider 在
// manifest 未就绪时会回退 Web Speech，不会崩。
void loadAudioManifest();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
