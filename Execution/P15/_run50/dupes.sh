cd /home/user/carta-travel-app
grep -oE "^\| [A-K][0-9]+ \|" ROADMAP.md | sort | uniq -d
grep -oE "^\| T[0-9]+-[a-z0-9]+ \|" Execution/_OPEN.md | sort | uniq -d | head
python3 Execution/P15/_run50/check_closed.py
