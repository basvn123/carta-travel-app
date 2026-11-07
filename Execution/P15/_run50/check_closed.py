# Lists register rows that are in _OPEN-CLOSED.md as closed but came back into _OPEN.md through a merge.
import re
closed = [l for l in open('Execution/_OPEN-CLOSED.md') if re.search(r'closed by T\d+', l)]
ids = {l.split('|')[1].strip() for l in closed if l.startswith('| ')}
back = [l.split('|')[1].strip() for l in open('Execution/_OPEN.md') if l.startswith('| ') and l.split('|')[1].strip() in ids]
print('reopened by merge:', back if back else 'none')
