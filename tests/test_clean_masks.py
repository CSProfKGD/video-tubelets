import sys,unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from clean_masks import clean_mask,fill_matching_pinholes

class CleanupTest(unittest.TestCase):
    def test_pinholes_preserve_real_background_gaps(self):
        mask=np.zeros((30,30),np.uint8);mask[4:26,4:26]=255
        mask[10:12,10:12]=0;mask[18:20,18:20]=0
        rgb=np.full((30,30,3),30,np.uint8);rgb[18:20,18:20]=180
        result,filled=fill_matching_pinholes(mask,rgb)
        self.assertEqual(len(filled),1)
        self.assertTrue(np.all(result[10:12,10:12]==255))
        self.assertTrue(np.all(result[18:20,18:20]==0))
        self.assertTrue(np.all(result[:4]==0))
    def test_preserves_detached_anatomy_and_removes_distant_dust(self):
        mask=np.zeros((160,200),np.uint8)
        mask[30:130,60:110]=255
        mask[60:64,116:120]=255 # Small nearby fingertip.
        mask[60:80,140:160]=255 # Large detached hand: never area-filtered.
        mask[5:8,180:183]=255 # Remote speck.
        result,removed=clean_mask(mask)
        self.assertEqual(len(removed),1)
        self.assertEqual(removed[0]['area'],9)
        self.assertTrue(np.all(result[60:64,116:120]==255))
        self.assertTrue(np.all(result[60:80,140:160]==255))
        self.assertEqual(np.count_nonzero(mask)-np.count_nonzero(result),9)
if __name__=='__main__':unittest.main()
