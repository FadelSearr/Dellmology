import re
p='apps/ml-engine/dellmology/api/maintenance_api.py'
lines=open(p,'r',encoding='utf-8').read().splitlines()
stack=[]
for i,line in enumerate(lines,1):
    m_try=re.match(r"^(\s*)try:\s*$", line)
    m_except=re.match(r"^(\s*)except\b.*:\s*$", line)
    if m_try:
        indent=len(m_try.group(1))
        stack.append((i,indent))
    if m_except:
        indent=len(m_except.group(1))
        # find matching try with same indent or closest previous
        matched=False
        for j in range(len(stack)-1,-1,-1):
            if stack[j][1] == indent or stack[j][1] < indent:
                matched=True
                stack.pop(j)
                break
        if not matched:
            print('Unmatched except at', i, 'indent', indent)

if stack:
    print('Unclosed try blocks:')
    for i,ind in stack:
        print('  try at', i, 'indent', ind)
else:
    print('All try/except blocks matched')
