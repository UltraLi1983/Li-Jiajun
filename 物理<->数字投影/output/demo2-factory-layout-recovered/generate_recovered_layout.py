"""Render a reconstructed Demo2 layout from the recovered spatial JSON.

This is a new rendering of surviving 2026-09-05 records, not the lost original PNG.
"""
import json
from html import escape
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parent
DATA = json.loads((ROOT / '03-spatial-ground-truth-reconstructed.json').read_text())
W, H = 3920, 2240
OX, OY, PPM = 196, 280, 28
FONT = '/System/Library/Fonts/STHeiti Medium.ttc'
COLORS = {
    'receiving': ('#d9eaff', '#4a7fbd'), 'quality': ('#dfe7f6', '#65799a'),
    'quarantine': ('#f4dbe5', '#ae6285'), 'service': ('#e7e9ef', '#818a9e'),
    'shipping': ('#ead7e7', '#a15b91'), 'main_warehouse': ('#cfe0ff', '#2d5fa8'),
    'high_bay': ('#e8d6fb', '#8253af'), 'supermarket': ('#d2f2eb', '#278a7a'),
    'returnables': ('#e8f5d9', '#659044'), 'production': ('#f8e0d0', '#b46537'),
    'line_side': ('#e4f5f8', '#3f9aa6'), 'wip': ('#fbe7cb', '#b9863c'),
    'rework': ('#fde3d8', '#af6644'), 'storage': ('#e9e4d8', '#8f8062')
}

def px(point):
    return OX + point[0] * PPM, OY + point[1] * PPM

def box(area):
    p = area['boundaryM']
    a, b = px(p[0]), px(p[2])
    return (*a, *b)

def short_name(area):
    name = area['name']
    if area['type'] == 'line_side':
        return name
    if area['type'] == 'production':
        return name
    return name.split(' / ')[0]

def draw_png(reference: bool):
    image = Image.new('RGB', (W, H), '#f3f6fa')
    d = ImageDraw.Draw(image)
    font_title = ImageFont.truetype(FONT, 66)
    font_sub = ImageFont.truetype(FONT, 31)
    font_zone = ImageFont.truetype(FONT, 33)
    font_small = ImageFont.truetype(FONT, 26)
    font_micro = ImageFont.truetype(FONT, 22)
    d.rectangle((0, 0, W, 170), fill='#132338')
    d.text((196, 40), 'Demo2 汽车座椅骨架工厂 Layout', font=font_title, fill='white')
    d.text((200, 185), '120m × 60m  ·  根据 2026-09-05 原始坐标记录重建  ·  原始 PNG 与障碍物坐标未找回', font=font_sub, fill='#45566f')
    d.rectangle((OX, OY, OX+120*PPM, OY+60*PPM), fill='#ffffff', outline='#1d3048', width=7)
    for x in range(5, 120, 5):
        a = px((x, 0)); b = px((x, 60)); d.line((*a, *b), fill='#e8eef5', width=2)
    for y in range(5, 60, 5):
        a = px((0, y)); b = px((120, y)); d.line((*a, *b), fill='#e8eef5', width=2)
    for y in (29.6, 51):
        a, b = px((1, y-2.1)), px((119, y+2.1))
        d.rectangle((*a, *b), fill='#edf2f6')
        d.line((*px((1,y)), *px((119,y))), fill='#b6c4d2', width=3)
    for area in DATA['areas']:
        fill, stroke = COLORS.get(area['type'], ('#e9eef3', '#8495a5'))
        bounds = box(area)
        d.rounded_rectangle(bounds, radius=15, fill=fill, outline=stroke, width=4)
        x0,y0,x1,y1 = bounds
        label = short_name(area)
        font = font_micro if area['type']=='line_side' or x1-x0<220 else font_zone
        if x1-x0 < 140:
            label = area['id'].upper()
        text_box = d.textbbox((0,0),label,font=font)
        tx = x0 + max(8,(x1-x0-(text_box[2]-text_box[0]))/2)
        ty = y0 + max(5,(y1-y0-(text_box[3]-text_box[1]))/2-6)
        if area['type'] == 'production':
            tx, ty = x0 + 22, y0 + 18
        d.text((tx,ty),label,font=font,fill='#253953')
    for station in DATA['stations']:
        x,y=px(station['positionM'])
        d.rounded_rectangle((x-33,y-30,x+33,y+30),radius=10,fill='#d16b36',outline='white',width=3)
        d.text((x-20,y-15),station['id'],font=font_micro,fill='white')
    if reference:
        nodes={n['id']:n['positionM'] for n in DATA['pathNetwork']['nodes']}
        for segment in DATA['pathNetwork']['segments']:
            a,b=px(nodes[segment['fromNodeId']]),px(nodes[segment['toNodeId']])
            d.line((*a,*b),fill='#087dba' if segment['clearWidthM']>=2.8 else '#b86f3b',width=9)
        for point in DATA['deliveryPoints']:
            x,y=px(point['positionM'])
            d.ellipse((x-16,y-16,x+16,y+16),fill='#087dba',outline='white',width=3)
    d.text((196, 2040), '蓝色：仓储 / 收发   青色：线边 / 超市   橙色：产线 / WIP   紫色：高位货架', font=font_sub, fill='#42546b')
    d.text((196, 2100), 'RECOVERED REFERENCE · 26 areas · 8 stations · 8 delivery points · 26 route segments · original 55 obstacle outlines unavailable', font=font_small, fill='#66778b')
    name = '02-digital-reference-reconstructed.png' if reference else '01-source-layout-reconstructed.png'
    image.save(ROOT / name)

def draw_svg(reference: bool):
    parts=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
           '<rect width="100%" height="100%" fill="#f3f6fa"/>',
           '<rect width="100%" height="170" fill="#132338"/>',
           '<text x="196" y="105" fill="white" font-family="sans-serif" font-size="65" font-weight="700">Demo2 汽车座椅骨架工厂 Layout</text>',
           '<text x="200" y="230" fill="#45566f" font-family="sans-serif" font-size="31">120m × 60m · 根据原始坐标记录重建 · 原始 PNG 与障碍物坐标未找回</text>',
           f'<rect x="{OX}" y="{OY}" width="3360" height="1680" fill="white" stroke="#1d3048" stroke-width="7"/>']
    for x in range(5,120,5):
        px_x=OX+x*PPM
        parts.append(f'<line x1="{px_x}" y1="{OY}" x2="{px_x}" y2="{OY+1680}" stroke="#e8eef5" stroke-width="2"/>')
    for y in range(5,60,5):
        px_y=OY+y*PPM
        parts.append(f'<line x1="{OX}" y1="{px_y}" x2="{OX+3360}" y2="{px_y}" stroke="#e8eef5" stroke-width="2"/>')
    for y in (29.6,51):
        parts.append(f'<rect x="{OX+PPM}" y="{OY+(y-2.1)*PPM}" width="{118*PPM}" height="{4.2*PPM}" fill="#edf2f6"/>')
    for area in DATA['areas']:
        fill,stroke=COLORS.get(area['type'],('#e9eef3','#8495a5'))
        x0,y0,x1,y1=box(area)
        label=short_name(area) if x1-x0>=140 else area['id'].upper()
        size=22 if area['type']=='line_side' or x1-x0<220 else 33
        parts.append(f'<rect x="{x0}" y="{y0}" width="{x1-x0}" height="{y1-y0}" rx="15" fill="{fill}" stroke="{stroke}" stroke-width="4"/>')
        label_x = x0 + 22 if area['type'] == 'production' else (x0+x1)/2
        label_y = y0 + 53 if area['type'] == 'production' else (y0+y1)/2+size/3
        anchor = 'start' if area['type'] == 'production' else 'middle'
        parts.append(f'<text x="{label_x}" y="{label_y}" text-anchor="{anchor}" fill="#253953" font-family="sans-serif" font-size="{size}" font-weight="700">{escape(label)}</text>')
    for station in DATA['stations']:
        x,y=px(station['positionM'])
        parts.append(f'<rect x="{x-33}" y="{y-30}" width="66" height="60" rx="10" fill="#d16b36" stroke="white" stroke-width="3"/><text x="{x}" y="{y+9}" text-anchor="middle" fill="white" font-family="sans-serif" font-size="23" font-weight="700">{station["id"]}</text>')
    if reference:
        nodes={n['id']:n['positionM'] for n in DATA['pathNetwork']['nodes']}
        for segment in DATA['pathNetwork']['segments']:
            a,b=px(nodes[segment['fromNodeId']]),px(nodes[segment['toNodeId']])
            color='#087dba' if segment['clearWidthM']>=2.8 else '#b86f3b'
            parts.append(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="{color}" stroke-width="9" stroke-linecap="round"/>')
        for point in DATA['deliveryPoints']:
            x,y=px(point['positionM'])
            parts.append(f'<circle cx="{x}" cy="{y}" r="16" fill="#087dba" stroke="white" stroke-width="3"/>')
    parts.append('<text x="196" y="2090" fill="#52667d" font-family="sans-serif" font-size="28">RECOVERED REFERENCE · 26 areas · 8 stations · 8 delivery points · 26 route segments · original 55 obstacle outlines unavailable</text>')
    parts.append('</svg>')
    name='02-digital-reference-reconstructed.svg' if reference else '01-source-layout-reconstructed.svg'
    (ROOT/name).write_text('\n'.join(parts))

for reference in (False,True):
    draw_svg(reference)
    draw_png(reference)
print('rendered reconstructed SVG and PNG')
