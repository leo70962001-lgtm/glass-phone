import sys
from PIL import Image, ImageDraw
src, out, x0, y0, x1, y1, scale, step = sys.argv[1], sys.argv[2], *map(int, sys.argv[3:9])
im = Image.open(src).convert('RGB').crop((x0, y0, x1, y1))
im = im.resize((im.width*scale, im.height*scale), Image.NEAREST)
d = ImageDraw.Draw(im)
for x in range((x0//step+1)*step, x1, step):
    X = (x-x0)*scale; d.line([(X,0),(X,im.height)], fill=(0,255,0) if x%(step*4)==0 else (0,120,0)); d.text((X+2,2), str(x), fill=(255,255,0))
for y in range((y0//step+1)*step, y1, step):
    Y = (y-y0)*scale; d.line([(0,Y),(im.width,Y)], fill=(0,255,0) if y%(step*4)==0 else (0,120,0)); d.text((2,Y+2), str(y), fill=(255,255,0))
im.save(out)
