import { useEffect } from 'react';

/**
 * 把 CSS 变量 --app-height 设为当前真实可视高度。
 *
 * 为什么需要：iOS Safari / Android Chrome 的 100vh 是「地址栏收起时」的最大高度，
 * 地址栏展开或虚拟键盘弹起时，视觉视口（visualViewport）比布局视口小几百像素。
 * 用 100vh 布局会把底部导航和提交按钮推到键盘下。visualViewport.height 反映真正可见区域，
 * 监听 resize/scroll 实时同步，键盘收起后自动恢复。
 *
 * 只写 CSS 变量、不触发 React 重渲染，避免键盘动画期间的高频 setState。
 */
export function useViewportHeight(): void {
  useEffect(() => {
    const apply = () => {
      const vv = window.visualViewport;
      const height = vv ? vv.height : window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${height}px`);
    };
    apply();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', apply);
      vv.addEventListener('scroll', apply);
    }
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);

    return () => {
      if (vv) {
        vv.removeEventListener('resize', apply);
        vv.removeEventListener('scroll', apply);
      }
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
    };
  }, []);
}
