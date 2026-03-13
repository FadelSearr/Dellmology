import os
root='.'
for dirpath,dirnames,filenames in os.walk(root):
    if '.git' in dirpath.split(os.sep):
        continue
    for f in filenames:
        try:
            fp=os.path.join(dirpath,f)
            s=os.path.getsize(fp)
            if s>10*1024*1024:
                print(f"{s/1024/1024:.2f} MB\t{fp}")
        except Exception:
            pass
