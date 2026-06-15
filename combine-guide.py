import re

# Read all 5 parts
parts = []
for i in range(1, 6):
    with open(f'guide-part{i}.html', 'r', encoding='utf-8') as f:
        content = f.read()
    # Extract body content (everything between <body> and </body>)
    match = re.search(r'<body>(.*?)</body>', content, re.DOTALL)
    if match:
        parts.append(match.group(1).strip())
    else:
        # If no body tags, use entire content minus head
        parts.append(content)

# Build combined HTML
html = '''<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="UTF-8">
<title>VoltERP ব্যবহারকারী গাইড</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
''' 

# Read the CSS file
with open('guide-styles.css', 'r', encoding='utf-8') as f:
    css = f.read()

html += css + '''
</style>
</head>
<body>
'''

for part in parts:
    html += part + '\n\n'

html += '''
</body>
</html>'''

# Write combined HTML
with open('volterp-guide.html', 'w', encoding='utf-8') as f:
    f.write(html)

print(f"Combined HTML written: {len(html)} bytes")
