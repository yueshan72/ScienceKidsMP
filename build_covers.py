# -*- coding: utf-8 -*-
"""生成「小宇宙科普」视频封面（640x360，太空风）。
运行：python gen_covers.py
输出：miniprogram/assets/covers/*.jpg
"""
import os
import random
import math
from PIL import Image, ImageDraw, ImageFilter

W, H = 1280, 720
BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "miniprogram", "assets", "covers")
os.makedirs(OUT, exist_ok=True)


def add_glow(img, cx, cy, r, color, blur):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    return Image.alpha_composite(img, layer)


def base(seed=2027, nebula_a=(150, 60, 255, 60), nebula_b=(40, 150, 255, 50)):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    d = ImageDraw.Draw(img)
    top, bottom = (26, 11, 61), (5, 10, 28)
    for y in range(H):
        t = y / (H - 1)
        c = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        d.line([(0, y), (W, y)], fill=c + (255,))

    img = add_glow(img, int(W * 0.22), int(H * 0.18), 280, nebula_a, 150)
    img = add_glow(img, int(W * 0.82), int(H * 0.80), 250, nebula_b, 140)

    rnd = random.Random(seed)
    d = ImageDraw.Draw(img)
    for _ in range(180):
        x, y = rnd.randrange(W), rnd.randrange(H)
        rad = rnd.choice([1, 1, 1, 2, 2, 3, 4])
        a = rnd.randint(90, 235)
        d.ellipse([x - rad, y - rad, x + rad, y + rad], fill=(255, 255, 255, a))
    return img


def circle(img, cx, cy, r, fill):
    d = ImageDraw.Draw(img)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)


def planet(img, cx, cy, r, color, glow_color, craters=0, crater_color=(0, 0, 0, 50),
           highlight=(255, 255, 255, 45)):
    img = add_glow(img, cx, cy, int(r * 1.6), glow_color, int(r * 0.5))
    circle(img, cx, cy, r, color)
    # 高光：小面积柔光，避免看起来像第二个天体
    d = ImageDraw.Draw(img)
    d.ellipse([cx - r * 0.60, cy - r * 0.70, cx - r * 0.05, cy - r * 0.12],
              fill=highlight)
    # 陨石坑
    rnd = random.Random(int(cx + cy))
    for _ in range(craters):
        a = rnd.random() * math.tau
        dist = rnd.random() * r * 0.72
        x = cx + math.cos(a) * dist
        y = cy + math.sin(a) * dist
        rr = r * (0.05 + rnd.random() * 0.10)
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=crater_color)
    return img


def rocket_cover():
    img = base(11)
    # 远处地球
    img = planet(img, 1040, 560, 120, (42, 123, 255, 255),
                 (80, 180, 255, 55), craters=0)
    circle(img, 1080, 520, 35, (61, 220, 132, 235))
    circle(img, 1000, 610, 26, (61, 220, 132, 235))

    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = 480, 370
    # 尾焰
    d.polygon([(cx - 45, cy + 150), (cx, cy + 320), (cx + 45, cy + 150)],
              fill=(255, 138, 0, 255))
    d.polygon([(cx - 25, cy + 150), (cx, cy + 250), (cx + 25, cy + 150)],
              fill=(255, 225, 130, 255))
    # 机身
    d.rounded_rectangle([cx - 55, cy - 120, cx + 55, cy + 160], radius=55,
                        fill=(255, 246, 229, 255))
    # 机头
    d.polygon([(cx - 55, cy - 100), (cx, cy - 250), (cx + 55, cy - 100)],
              fill=(255, 77, 109, 255))
    # 舷窗
    d.ellipse([cx - 34, cy - 35, cx + 34, cy + 33], fill=(75, 225, 255, 255))
    d.ellipse([cx - 22, cy - 28, cx - 2, cy - 8], fill=(255, 255, 255, 200))
    # 尾翼
    d.polygon([(cx - 55, cy + 60), (cx - 130, cy + 165), (cx - 55, cy + 140)],
              fill=(255, 77, 109, 255))
    d.polygon([(cx + 55, cy + 60), (cx + 130, cy + 165), (cx + 55, cy + 140)],
              fill=(255, 77, 109, 255))
    layer = layer.rotate(-18, resample=Image.BICUBIC, center=(cx, cy))
    img = Image.alpha_composite(img, layer)
    # 速度线
    d = ImageDraw.Draw(img)
    for i in range(6):
        y = 520 + i * 28
        d.line([(120 + i * 10, y), (330 + i * 20, y)], fill=(255, 255, 255, 40), width=4)
    return img


def moon_cover():
    img = base(12, nebula_a=(40, 120, 255, 45), nebula_b=(150, 60, 255, 45))
    img = planet(img, 430, 360, 230, (255, 243, 196, 255),
                 (255, 220, 120, 55), craters=9,
                 crater_color=(190, 150, 70, 95), highlight=(255, 255, 255, 55))
    # 小地球
    img = planet(img, 1010, 520, 95, (42, 123, 255, 255),
                 (80, 180, 255, 55))
    circle(img, 1040, 490, 26, (61, 220, 132, 235))
    circle(img, 980, 550, 20, (61, 220, 132, 235))
    return img


def float_cover():
    img = base(13, nebula_a=(40, 160, 255, 55), nebula_b=(150, 60, 255, 40))
    # 下方地球
    img = planet(img, 380, 760, 330, (42, 123, 255, 255),
                 (80, 180, 255, 60))
    circle(img, 320, 690, 80, (61, 220, 132, 235))
    circle(img, 470, 620, 55, (61, 220, 132, 235))

    # 宇航员（简单矢量）
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = 780, 300
    white = (245, 248, 255, 255)
    gray = (190, 200, 225, 255)
    blue = (75, 225, 255, 255)
    # 背包
    d.rounded_rectangle([cx - 95, cy + 20, cx + 95, cy + 180], radius=30, fill=gray)
    # 身体
    d.rounded_rectangle([cx - 70, cy - 20, cx + 70, cy + 150], radius=55, fill=white)
    # 手臂
    d.line([(cx - 65, cy + 30), (cx - 165, cy + 105)], fill=white, width=38, joint="curve")
    d.line([(cx + 65, cy + 20), (cx + 175, cy - 45)], fill=white, width=38, joint="curve")
    # 腿
    d.line([(cx - 35, cy + 140), (cx - 90, cy + 250)], fill=white, width=42, joint="curve")
    d.line([(cx + 35, cy + 140), (cx + 100, cy + 230)], fill=white, width=42, joint="curve")
    # 头盔
    d.ellipse([cx - 85, cy - 175, cx + 85, cy - 5], fill=white)
    d.ellipse([cx - 62, cy - 150, cx + 52, cy - 30], fill=blue)
    d.ellipse([cx - 40, cy - 135, cx - 5, cy - 90], fill=(255, 255, 255, 190))
    img = Image.alpha_composite(img, layer)
    return img


def mars_cover():
    img = base(14, nebula_a=(255, 100, 60, 45), nebula_b=(150, 60, 255, 40))
    img = planet(img, 700, 360, 260, (229, 84, 75, 255),
                 (255, 120, 80, 55), craters=6,
                 crater_color=(150, 40, 35, 95), highlight=(255, 210, 180, 50))
    # 极冠
    d = ImageDraw.Draw(img)
    d.ellipse([640, 118, 760, 190], fill=(255, 240, 225, 220))
    # 两颗小卫星
    circle(img, 250, 170, 18, (220, 210, 190, 255))
    circle(img, 1080, 550, 12, (220, 210, 190, 255))
    return img


def blackhole_cover():
    img = base(15, nebula_a=(150, 60, 255, 45), nebula_b=(255, 100, 50, 45))
    cx, cy = 690, 360
    # 吸积盘（大椭圆）
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse([cx - 360, cy - 95, cx + 360, cy + 95], fill=(255, 140, 40, 220))
    d.ellipse([cx - 300, cy - 70, cx + 300, cy + 70], fill=(255, 220, 130, 230))
    layer = layer.filter(ImageFilter.GaussianBlur(18))
    img = Image.alpha_composite(img, layer)
    # 黑洞
    img = add_glow(img, cx, cy, 190, (255, 120, 40, 90), 70)
    circle(img, cx, cy, 155, (0, 0, 0, 255))
    # 光环
    d = ImageDraw.Draw(img)
    d.arc([cx - 235, cy - 70, cx + 235, cy + 85], 200, 340, fill=(255, 230, 160, 210), width=8)
    return img


def orbit_cover():
    img = base(16, nebula_a=(255, 150, 60, 40), nebula_b=(40, 150, 255, 50))
    # 太阳
    img = add_glow(img, 260, 360, 230, (255, 180, 60, 90), 80)
    circle(img, 260, 360, 105, (255, 209, 102, 255))
    circle(img, 230, 330, 35, (255, 240, 180, 180))
    # 轨道
    d = ImageDraw.Draw(img)
    d.ellipse([300, 130, 1180, 630], outline=(255, 255, 255, 90), width=5)
    # 地球
    img = planet(img, 980, 380, 85, (42, 123, 255, 255),
                 (80, 180, 255, 55))
    circle(img, 1005, 355, 24, (61, 220, 132, 235))
    circle(img, 955, 405, 18, (61, 220, 132, 235))
    # 轨道上的小卫星
    d = ImageDraw.Draw(img)
    d.ellipse([760, 190, 800, 230], fill=(255, 246, 229, 255))
    d.rectangle([772, 170, 788, 190], fill=(255, 77, 109, 255))
    return img


def save(img, name):
    img = img.convert("RGB").resize((640, 360), Image.LANCZOS)
    path = os.path.join(OUT, name)
    img.save(path, "JPEG", quality=88, optimize=True)
    print(path, os.path.getsize(path))


if __name__ == "__main__":
    save(rocket_cover(), "rocket.jpg")
    save(moon_cover(), "moon.jpg")
    save(float_cover(), "float.jpg")
    save(mars_cover(), "mars.jpg")
    save(blackhole_cover(), "blackhole.jpg")
    save(orbit_cover(), "orbit.jpg")
