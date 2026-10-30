const styleNames = {
  1: '深色工业指挥舱',
  2: '高级制造业白底仪表盘',
  3: '数字孪生科技蓝',
  4: '德系工业极简',
  5: '黑金高端老板视图',
  6: '运营控制塔',
  7: '工程 CAD 风格',
  8: 'Apple 式空间感',
  9: '精益咨询报告风格',
  10: '未来全息工厂风'
};

const styleDescriptions = {
  1: '黑蓝底、荧光青蓝、地图感强，适合作为 Demo2 主风格。',
  2: '白底、深蓝灰、专业克制，适合参数页和正式报告。',
  3: '蓝色渐变、透明面板、数字孪生感强，适合演示未来系统。',
  4: '黑白灰、硬线条、少装饰，强调工程理性。',
  5: '深黑与金色重点，商务质感强，适合老板向路演。',
  6: '运营控制塔感觉，适合 KPI、风险、24H 峰谷和运输任务。',
  7: '网格、线框、节点、坐标感强，适合 Layout 标注页。',
  8: '柔和玻璃、圆角、空间层次，高级但工业硬度稍弱。',
  9: '白底、表格、红黄绿风险，适合售前报告和咨询交付。',
  10: '暗色、霓虹线框、全息感强，视觉冲击最大但需克制。'
};

function renderPreview(styleId) {
  document.body.classList.add(`style-${styleId}`);
  const title = styleNames[styleId] ?? 'Demo2 UI 预览';
  const desc = styleDescriptions[styleId] ?? '';
  document.title = `${styleId}. ${title}`;
  document.getElementById('page-title').textContent = `${styleId}. ${title}`;
  document.getElementById('preview-root').innerHTML = `
    <div class="app">
      <aside class="side">
        <div class="logo">
          <div class="mark">D2</div>
          <div>
            <div class="brand">OPS Twin</div>
            <div class="desc">Demo2 System</div>
          </div>
        </div>
        <div class="nav">
          <span>总览 Dashboard</span>
          <span>Layout 标注</span>
          <span>平面运营视图</span>
          <span>立面钻取</span>
          <span>方案对比</span>
          <span>售前报告</span>
        </div>
      </aside>
      <main class="main">
        <div class="top">
          <div>
            <div class="title">物理数字孪生运营视图</div>
            <div class="desc">${desc}</div>
          </div>
          <div class="chiprow">
            <div class="chip soft">路线 -25%</div>
            <div class="chip soft">线边 HU -15</div>
            <div class="chip soft">风险 4→1</div>
          </div>
        </div>
        <div class="layout">
          <section class="map">
            <div class="zone wh">主仓库</div>
            <div class="zone sm">超市区</div>
            <div class="zone line1">产线 A</div>
            <div class="zone line2">产线 B</div>
            <div class="zone rack">高位货架</div>
            <div class="path"></div>
            <div class="vehicle"></div>
          </section>
          <section class="panel">
            <div class="title" style="font-size:18px">Rack / Lane 立面钻取</div>
            <div class="desc">同一立面不同层、不同料道，对应不同物料与水位。</div>
            <div class="rack-mini">
              <div class="rack-row"><span>L3</span><div class="slot slot-normal">SKU-C 6/10</div><div class="slot slot-warning">SKU-B 8/12</div></div>
              <div class="rack-row"><span>L2</span><div class="slot slot-normal">SKU-A 4/8</div><div class="slot slot-normal">SKU-D 5/9</div></div>
              <div class="rack-row"><span>L1</span><div class="slot slot-warning">A2 大件 3/5</div><div class="slot slot-normal">A1 小件 4/8</div></div>
            </div>
            <div class="bar soft"></div>
            <div class="bar soft" style="width:86%"></div>
            <div class="bar soft" style="width:62%"></div>
          </section>
        </div>
        <div class="metrics">
          <div class="metric"><small>总搬运距离</small><b>2,130m</b></div>
          <div class="metric"><small>响应时间</small><b>17min</b></div>
          <div class="metric"><small>线边库存</small><b>27 HU</b></div>
          <div class="metric"><small>运输利用率</small><b>64%</b></div>
        </div>
      </main>
    </div>
  `;
}

window.renderPreview = renderPreview;
