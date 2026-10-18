#!/usr/bin/env python3
"""
TokenDeck 图标生成

设计约束（与 App 暗色毛玻璃一致）：
  · 底色取暗色主题的 --bg-main #111111 / --bg-card #191919 区间，
    不是纯黑，否则在启动器里会糊成一块没有层次的方块。
  · 玻璃感来自三件事：斜向明暗渐变、四边对称 rim light、左上柔光。
    四边必须对称 —— 单向亮边是之前踩过的坑（看起来像描边不像玻璃）。
  · 中间是折线图：细分隔线 + 面积渐变 + 折线 + 末端高光点。

输出：
  · 传统图标 48/72/96/144/192（圆角方形 + 圆形各一套）
  · 自适应图标 foreground 432（透明底，图形收在 66% 安全区内）
  · 自适应图标 background 432（深色渐变）
"""
from PIL import Image, ImageDraw, ImageFilter
import os

SS = 4  # 超采样倍数，最后缩回目标尺寸得到抗锯齿边缘

BASE = "/home/Ds.W/.openclaw/workspace/apps/tokendeck-android/app/src/main/res"

# 暗色主题取色
#
# 实测了三次，结论是：竖直渐变越明显，四边亮度差越大。
#   ① (35,42,53)→(11,14,18)：四边 64.4/14.3，极差 50.1
#   ② (44,53,66)→(24,29,38)：四边 73.3/25.9，极差 47.4（越调越糟）
# 因为 rim 高光叠在亮底上更亮、叠在暗底上几乎看不见，梯度会放大差异。
# 毛玻璃的底本来就是同一块材料，受光差别很小 —— 所以把跨度压到 6 以内，
# 玻璃感改由"四边等亮 rim + 居中柔光"提供，不再靠上下渐变。
C_TOP = (31, 37, 47)
C_BOTTOM = (25, 30, 39)
GREEN = (61, 220, 132)    # --brand-green-text  #3ddc84
GREEN_DEEP = (6, 173, 86) # --brand-green      #06ad56
WHITE = (255, 255, 255)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vgrad(size, top, bottom):
    """竖直渐变，再叠一点左上到右下的对角明暗。"""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        t = y / max(1, size - 1)
        row = lerp(top, bottom, t)
        for x in range(size):
            # 左上略亮，右下略暗：让平面有玻璃的厚度感
            d = (x / size + y / size) / 2
            k = 1.0 - 0.18 * d
            px[x, y] = tuple(min(255, round(c * k)) for c in row)
    return img


def rounded_mask(size, radius, ss=1):
    m = Image.new("L", (size * ss, size * ss), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size * ss - 1, size * ss - 1], radius=radius * ss, fill=255)
    return m.resize((size, size), Image.LANCZOS) if ss > 1 else m


def circle_mask(size, ss=1):
    m = Image.new("L", (size * ss, size * ss), 0)
    d = ImageDraw.Draw(m)
    d.ellipse([0, 0, size * ss - 1, size * ss - 1], fill=255)
    return m.resize((size, size), Image.LANCZOS) if ss > 1 else m


def draw_chart(size, inset_ratio=0.26, with_glow=True):
    """在透明画布上画折线图；返回 RGBA。图形收在中央，四周留安全边。"""
    S = size * SS
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    pad = S * inset_ratio
    w = S - pad * 2
    x0 = pad
    x1 = S - pad
    y1 = S - pad
    # 绘图区高度按宽度定，整体略微上移，补偿底部横轴占掉的视觉重量
    h = w * 0.66
    y0 = y1 - h

    # ---- 坐标轴 ----
    # 没有轴的时候，一条折线在 48px 上会被读成"心电图"或"锯齿"；
    # 加上 L 形两轴之后才明确是"图表"。
    # 轴用低对比的白，不用绿：绿色留给数据本身，否则轴和线抢注意力。
    ax_w = max(2, int(S * 0.014))
    axis_col = (255, 255, 255, 118)
    # Y 轴
    d.line([(x0, y0), (x0, y1)], fill=axis_col, width=ax_w)
    # X 轴
    d.line([(x0, y1), (x1, y1)], fill=axis_col, width=ax_w)

    # 刻度短线：只画短的、朝内的，作为"坐标"的语气词。
    # 不画贯穿全宽的网格线 —— 缩到 48px 会连成矩形轮廓（前面踩过一次）。
    tick_len = S * 0.022
    tick_col = (255, 255, 255, 82)
    for k in (0.34, 0.67):
        gy = y1 - h * k
        d.line([(x0, gy), (x0 + tick_len, gy)], fill=tick_col, width=ax_w)
        gx = x0 + w * k
        d.line([(gx, y1), (gx, y1 - tick_len)], fill=tick_col, width=ax_w)

    # 折线数据（0~1，1 为最高）；刻意做成上升趋势，一眼看出是"用量增长"
    pts_n = [0.28, 0.46, 0.34, 0.62, 0.52, 0.78, 0.70, 0.92]
    n = len(pts_n)
    pts = []
    # 数据点留出内边距，不要贴着轴画
    gx0 = x0 + w * 0.14
    gx1 = x1 - w * 0.03
    gy0 = y0 + h * 0.10
    gy1 = y1 - h * 0.14
    for i, v in enumerate(pts_n):
        px = gx0 + (gx1 - gx0) * i / (n - 1)
        py = gy1 - (gy1 - gy0) * v
        pts.append((px, py))

    # 不做横向参考线、不做面积填充。
    # 两者都试过，都失败了：
    #   ① 三条贯穿全宽的淡参考线，缩到 48px 后连成一圈矩形轮廓，
    #      看起来像折线后面有个半透明方块。
    #   ② 折线下方的面积填充，因为折线是上升的，右端从顶一直填到底，
    #      形成一道竖直亮带，评审描述为"从端点往下打了一束聚光灯"。
    # 图标在 48px 上只有几十个像素可用，任何大面积渐变都会变成噪声。
    # 结论：只用线本身表达图表，靠线宽和端点圆点建立层次。
    _ = with_glow  # 保留签名，当前不使用模糊辉光

    d.line(pts, fill=GREEN + (255,), width=int(S * 0.042), joint="curve")
    # 圆头端点
    r = S * 0.021
    for p in (pts[0], pts[-1]):
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=GREEN + (255,))

    # 末端高光点：白心 + 绿环，强调"最新值"。
    # 半径刻意与线宽同量级，不加外发光 —— 第一版给它单独加了模糊光晕，
    # 结果端点看着像另一个光源贴上去的，和线不是一体。
    ex, ey = pts[-1]
    R = S * 0.055
    d.ellipse([ex - R, ey - R, ex + R, ey + R], fill=GREEN_DEEP + (255,))
    d.ellipse([ex - R * 0.60, ey - R * 0.60, ex + R * 0.60, ey + R * 0.60], fill=(245, 255, 250, 255))

    return layer.resize((size, size), Image.LANCZOS)


def compose_icon(size, shape="squircle"):
    S = size * SS
    bg = vgrad(S, C_TOP, C_BOTTOM).convert("RGBA")
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # 环境光必须四面对称。
    # 第一版把绿色光源放在左下角，结果评审一眼看出"光从正下方打上来"，
    # 图标显得歪。改成居中的柔和径向，只压一点点饱和度，不偏任何一边。
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([S * 0.08, S * 0.10, S * 0.92, S * 0.94], fill=GREEN_DEEP + (26,))
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.20))
    bg.alpha_composite(glow)

    # 居中柔光。
    # 原来是"左上斜向"(ellipse 偏到 -0.55S)，等于明说光源在左上，
    # 于是底边必然最暗、四边不对称。毛玻璃面板的光是漫射的，
    # 所以改成以中心为圆心的弱径向，四边受光一致。
    spec = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(spec)
    ins = S * 0.10
    sd.ellipse([ins, ins, S - ins, S - ins], fill=WHITE + (16,))
    spec = spec.filter(ImageFilter.GaussianBlur(S * 0.16))
    bg.alpha_composite(spec)

    canvas.alpha_composite(bg)

    # 四边对称 rim：1px 亮线 + 向内的柔光衰减
    rim = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rim)
    for i in range(max(1, int(S * 0.010))):
        a = int(46 * (1 - i / max(1, S * 0.010)) ** 2)
        rd.rounded_rectangle(
            [i, i, S - 1 - i, S - 1 - i],
            radius=S * 0.225 - i,
            outline=WHITE + (a,),
            width=1,
        )
    rim = rim.filter(ImageFilter.GaussianBlur(S * 0.0025))
    canvas.alpha_composite(rim)

    chart = draw_chart(S, inset_ratio=0.30)
    canvas.alpha_composite(chart)

    # 裁形状
    if shape == "circle":
        mask = circle_mask(S)
    else:
        mask = rounded_mask(S, S * 0.225)

    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.paste(canvas, (0, 0), mask)
    return out.resize((size, size), Image.LANCZOS)


def main():
    sizes = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

    for dens, px in sizes.items():
        d = os.path.join(BASE, f"mipmap-{dens}")
        os.makedirs(d, exist_ok=True)
        compose_icon(px, "squircle").save(os.path.join(d, "ic_launcher.png"), optimize=True)
        compose_icon(px, "circle").save(os.path.join(d, "ic_launcher_round.png"), optimize=True)
        print(f"{dens:8s} {px:3d}px  ok")

    # ---------------- 自适应图标 ----------------
    #
    # ⚠️ 这里踩过一个隐蔽的坑，导致"换了图标但桌面没变"：
    # 自适应前景/背景原先只生成一张 432px，丢进 res/drawable/（无密度限定）。
    # 无限定目录按 mdpi 基线处理，而 108dp 的前景在 xxhdpi 上应是 324px、
    # xxxhdpi 上 432px —— 系统于是把这张图按倍数缩放，边缘发糊，
    # 更糟的是启动器对同一资源名的旧位图有缓存，看起来就像"根本没换"。
    # 正确做法：每个密度各出一张，尺寸 = 108dp × 该密度倍数。
    adaptive = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}

    for dens, px in adaptive.items():
        d = os.path.join(BASE, f"drawable-{dens}")
        os.makedirs(d, exist_ok=True)

        # 前景：透明底，图形收在中间约 66% 安全区（系统会把四周裁掉）
        fg = draw_chart(px, inset_ratio=0.315)
        fg.save(os.path.join(d, "ic_launcher_foreground.png"), optimize=True)

        # 背景：整块渐变，不带圆角（形状由系统裁）
        S = px * SS
        bg = vgrad(S, C_TOP, C_BOTTOM).convert("RGBA")
        glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.ellipse([S * 0.08, S * 0.10, S * 0.92, S * 0.94], fill=GREEN_DEEP + (22,))
        glow = glow.filter(ImageFilter.GaussianBlur(S * 0.20))
        bg.alpha_composite(glow)
        spec = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        sd = ImageDraw.Draw(spec)
        ins = S * 0.10
        sd.ellipse([ins, ins, S - ins, S - ins], fill=WHITE + (14,))
        spec = spec.filter(ImageFilter.GaussianBlur(S * 0.16))
        bg.alpha_composite(spec)
        bg.resize((px, px), Image.LANCZOS).convert("RGB").save(
            os.path.join(d, "ic_launcher_background.png"), optimize=True
        )

        print(f"adaptive {dens:8s} {px:3d}px  ok")


if __name__ == "__main__":
    main()
