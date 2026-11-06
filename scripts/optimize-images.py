#!/usr/bin/env python3
"""Create content-addressed responsive copies; never replace originals."""
import hashlib,json
from pathlib import Path
from PIL import Image,ImageOps
Image.MAX_IMAGE_PIXELS=40_000_000

def optimize(assets,manifest_path):
    assets=Path(assets);target=assets/'optimized';target.mkdir(exist_ok=True)
    result={};before=after=0
    for source in sorted(assets.rglob('*')):
        if not source.is_file() or source.is_symlink() or target in source.parents or source.suffix.lower() not in ('.jpg','.jpeg','.png','.webp'):continue
        if source.stat().st_size<150_000:continue
        try:
            with Image.open(source) as original:
                if getattr(original,'is_animated',False):continue
                image=ImageOps.exif_transpose(original)
                if image.width<640:continue
                image=image.convert('RGBA' if 'A' in image.getbands() else 'RGB')
                digest=hashlib.sha256(source.read_bytes()).hexdigest()[:20]
                widths=sorted({min(w,image.width) for w in (480,960,1600)})
                variants=[]
                for width in widths:
                    output=target/f'{digest}-{width}.webp'
                    if not output.exists():
                        copy=image.copy();copy.thumbnail((width,round(image.height*width/image.width)),Image.Resampling.LANCZOS)
                        copy.save(output,'WEBP',quality=82,method=4)
                    variants.append({'path':'assets/optimized/'+output.name,'width':width})
                social=target/f'{digest}-og-1200x630.jpg'
                if not social.exists():
                    cover=ImageOps.fit(image,(1200,630),method=Image.Resampling.LANCZOS)
                    if cover.mode=='RGBA':
                        background=Image.new('RGB',cover.size,'#f5f3ee');background.paste(cover,mask=cover.getchannel('A'));cover=background
                    cover.convert('RGB').save(social,'JPEG',quality=86,optimize=True)
                key='assets/'+source.relative_to(assets).as_posix()
                result[key]={'width':image.width,'height':image.height,'variants':variants,'social':{'path':'assets/optimized/'+social.name,'width':1200,'height':630,'type':'image/jpeg'}}
                before+=source.stat().st_size;after+=(target/Path(variants[-1]['path']).name).stat().st_size
        except (OSError,ValueError,Image.DecompressionBombError):continue
    Path(manifest_path).write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
    print(f'Optimized {len(result)} images: originals {before} bytes; largest display variants {after} bytes')
    return result

if __name__=='__main__':
    root=Path(__file__).resolve().parents[1]
    optimize(root/'assets',root/'site-worker/src/image-manifest.json')
