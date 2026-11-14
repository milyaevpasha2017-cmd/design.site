import importlib.util,json,tempfile,unittest
from pathlib import Path
from PIL import Image
spec=importlib.util.spec_from_file_location('optimizer',Path(__file__).resolve().parents[1]/'scripts/optimize-images.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class ImageOptimizationTests(unittest.TestCase):
 def test_responsive_copies_preserve_original_and_have_content_addresses(self):
  with tempfile.TemporaryDirectory() as tmp:
   assets=Path(tmp)/'assets';assets.mkdir();source=assets/'photo.jpg'
   Image.effect_noise((1800,1200),60).convert('RGB').save(source,quality=97)
   before=source.read_bytes();manifest=Path(tmp)/'manifest.json'
   result=module.optimize(assets,manifest);item=result['assets/photo.jpg']
   self.assertEqual(source.read_bytes(),before);self.assertEqual([v['width'] for v in item['variants']],[320,480,640,960,1600]);self.assertEqual(item['width'],1800)
   for v in item['variants']:
    path=Path(tmp)/v['path'];self.assertTrue(path.exists())
    with Image.open(path) as image:self.assertEqual(image.width,v['width'])
   self.assertLess((Path(tmp)/item['variants'][0]['path']).stat().st_size,len(before))
   preview=item['social'];self.assertEqual(preview['type'],'image/jpeg')
   with Image.open(Path(tmp)/preview['path']) as image:
    self.assertEqual(image.size,(1200,630));self.assertEqual(image.format,'JPEG')
   self.assertEqual(json.loads(manifest.read_text()),result)
 def test_small_photos_reserve_layout_space_without_reencoding(self):
  with tempfile.TemporaryDirectory() as tmp:
   assets=Path(tmp)/'assets';assets.mkdir();source=assets/'small.png'
   Image.new('RGB',(320,200),'white').save(source);before=source.read_bytes()
   result=module.optimize(assets,Path(tmp)/'manifest.json')
   self.assertEqual(result['assets/small.png'],{'width':320,'height':200});self.assertEqual(source.read_bytes(),before)
 def test_large_narrow_image_gets_responsive_copies(self):
  with tempfile.TemporaryDirectory() as tmp:
   assets=Path(tmp)/'assets';assets.mkdir();source=assets/'portrait.png'
   Image.effect_noise((500,900),60).convert('RGB').save(source)
   before=source.read_bytes()
   result=module.optimize(assets,Path(tmp)/'manifest.json')
   variants=result['assets/portrait.png']['variants']
   self.assertEqual([variant['width'] for variant in variants],[320,480,500])
   self.assertLess((Path(tmp)/variants[-1]['path']).stat().st_size,len(before))
   self.assertEqual(source.read_bytes(),before)
