# -*- coding: utf-8 -*-
"""生成创始团队合作与治理结构 PPT 的配套图表"""
import os
from matplotlib import font_manager
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch

# ---------- 全局设置 ----------
font_manager.fontManager.addfont('/System/Library/Fonts/Hiragino Sans GB.ttc')
plt.rcParams['font.family'] = ['Hiragino Sans GB']
plt.rcParams['axes.unicode_minus'] = False
plt.rcParams['figure.dpi'] = 200

OUT = os.path.dirname(os.path.abspath(__file__))

NAVY   = '#16324F'   # 主深蓝
BLUE   = '#2E6DA4'   # 投资人
TEAL   = '#00A99D'   # CEO
ORANGE = '#F5A623'   # ESOP
GRAY   = '#8A94A6'
BG     = '#FFFFFF'
LIGHT  = '#EEF3F8'

def save(fig, name):
    fig.savefig(os.path.join(OUT, name), dpi=200, bbox_inches='tight',
                facecolor=BG, pad_inches=0.15)
    plt.close(fig)
    print('saved', name)

# ---------- 图1：股权结构方案对比（堆叠条形图） ----------
def equity_chart():
    fig, ax = plt.subplots(figsize=(8.6, 4.4))
    plans = [
        ('方案 A\n70 / 5 / 25', 70, 5, 25, '职业经理人模式'),
        ('方案 B\n55 / 35 / 10', 55, 35, 10, '联合创始人模式'),
        ('方案 C\n51 / 39 / 10', 51, 39, 10, '联合创始人模式'),
    ]
    y = range(len(plans))[::-1]
    for i, (label, inv, ceo, esop, mode) in enumerate(plans):
        yy = y[i]
        left = 0
        segs = [(inv, BLUE, f'{inv}%'), (ceo, TEAL, f'{ceo}%'), (esop, ORANGE, f'{esop}%')]
        for val, color, txt in segs:
            ax.barh(yy, val, left=left, color=color, height=0.52, edgecolor='white', linewidth=1.2)
            if val > 4:
                ax.text(left + val/2, yy, txt, ha='center', va='center',
                        color='white', fontsize=13, fontweight='bold')
            left += val
        ax.text(104.5, yy, mode, va='center', fontsize=11.5, color=NAVY, fontweight='bold')
    ax.set_yticks(list(y))
    ax.set_yticklabels([p[0] for p in plans], fontsize=12.5, fontweight='bold', color=NAVY)
    ax.set_xlim(0, 135)
    ax.set_ylim(-0.6, len(plans) - 0.4)
    ax.set_xticks([])
    for s in ['top', 'right', 'bottom', 'left']:
        ax.spines[s].set_visible(False)
    legend = [mpatches.Patch(color=BLUE, label='投资人'), mpatches.Patch(color=TEAL, label='CEO'),
              mpatches.Patch(color=ORANGE, label='ESOP')]
    ax.legend(handles=legend, loc='lower right', frameon=False, fontsize=11.5, ncol=3,
              bbox_to_anchor=(0.62, -0.18))
    ax.set_title('股权结构方案对比（投资人 / CEO / ESOP）', fontsize=15.5,
                 fontweight='bold', color=NAVY, pad=14)
    save(fig, 'equity_chart.png')

# ---------- 图2：合作模式对比 ----------
def model_compare():
    fig, ax = plt.subplots(figsize=(9.2, 4.5))
    ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.axis('off')

    def card(x, w, title, color, items, note):
        # 标题块
        ax.add_patch(FancyBboxPatch((x, 78), w, 15, boxstyle='round,pad=0.6,rounding_size=1.4',
                                    facecolor=color, edgecolor='none'))
        ax.text(x + w/2, 85.5, title, ha='center', va='center', color='white',
                fontsize=15, fontweight='bold')
        # 内容块
        ax.add_patch(FancyBboxPatch((x, 18), w, 58, boxstyle='round,pad=0.6,rounding_size=1.4',
                                    facecolor=LIGHT, edgecolor='none'))
        for j, t in enumerate(items):
            ax.text(x + 3.5, 66 - j * 9.5, '•  ' + t, ha='left', va='top', fontsize=11.3, color=NAVY)
        # 底部说明
        ax.add_patch(FancyBboxPatch((x, 4), w, 11, boxstyle='round,pad=0.6,rounding_size=1.4',
                                    facecolor='white', edgecolor=color, linewidth=1.5))
        ax.text(x + w/2, 9.5, note, ha='center', va='center', fontsize=10.5, color=color, fontweight='bold')

    card(2, 47, '联合创始人模式', NAVY,
         ['双方共同承担公司成败', '投资人：资本 + 市场 + 基础设施',
          'CEO 全职负责经营与产品、研发、交付、团队',
          '股权即长期激励，权责深度绑定'],
         '谈判区间：55/35/10 或 51/39/10')
    card(51, 47, '职业经理人模式', GRAY,
         ['投资人作为控股股东', 'CEO 依据雇佣与激励合同经营',
          '市场化薪酬 + 奖金 + 期权',
          '明确的职业保障与无因解聘保护'],
         '若坚持 70/5/25，须补齐上述保障')
    save(fig, 'model_compare.png')

# ---------- 图3：四年 Vesting 时间轴 ----------
def vesting_chart():
    fig, ax = plt.subplots(figsize=(8.6, 3.9))
    years = [0, 1, 2, 3, 4]
    pct = [0, 25, 50, 75, 100]
    ax.step([0, 1, 1, 2, 2, 3, 3, 4], [0, 0, 25, 25, 50, 50, 75, 75],
            where='post', color=TEAL, linewidth=3.2)
    ax.plot([1], [25], 'o', color=ORANGE, markersize=10, zorder=5)
    ax.plot([4], [100], 'o', color=NAVY, markersize=10, zorder=5)
    ax.fill_between([0, 1], 0, 110, color=ORANGE, alpha=0.10)
    ax.annotate('第 1 年悬崖（Cliff）\n满 1 年一次性归属 25%', xy=(1, 25), xytext=(1.45, 52),
                fontsize=10.5, color='#C77B00', arrowprops=dict(arrowstyle='->', color='#C77B00'))
    ax.annotate('第 4 年累计归属 100%\n此后按月继续归属', xy=(4, 100), xytext=(2.5, 88),
                fontsize=10.5, color=NAVY, arrowprops=dict(arrowstyle='->', color=NAVY))
    ax.text(0.5, 6, '创始人全职投入，逐步获得服务贡献型创始股', ha='center', fontsize=9.5, color='#C77B00')
    ax.set_xticks(years); ax.set_xticklabels([f'{y} 年' if y else '入职' for y in years], fontsize=11.5)
    ax.set_yticks([0, 25, 50, 75, 100]); ax.set_yticklabels(['0%', '25%', '50%', '75%', '100%'], fontsize=10.5)
    ax.set_ylim(0, 110); ax.set_xlim(0, 4.2)
    ax.grid(axis='y', color='#DDE4EC', linewidth=0.8)
    for s in ['top', 'right']:
        ax.spines[s].set_visible(False)
    ax.set_title('服务贡献型创始股：四年归属（Vesting）与一年悬崖', fontsize=15,
                 fontweight='bold', color=NAVY, pad=12)
    save(fig, 'vesting_chart.png')

if __name__ == '__main__':
    equity_chart()
    model_compare()
    vesting_chart()
    print('all charts done ->', OUT)
