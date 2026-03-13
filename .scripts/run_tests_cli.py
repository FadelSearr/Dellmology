import sys
import pytest

args = ['-vv','--rootdir=apps/ml-engine','apps/ml-engine/tests']
print('Running pytest with args:', args)
ret = pytest.main(args)
print('pytest return code:', ret)
sys.exit(ret)
