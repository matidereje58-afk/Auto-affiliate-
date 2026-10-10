import sys,urllib.parse,urllib.request,re,html
def s(q):
    u='https://www.bing.com/search?format=rss&q='+urllib.parse.quote(q)
    r=urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'})
    d=urllib.request.urlopen(r,timeout=15).read().decode('utf-8','replace')
    items=re.findall(r'<item>(.*?)</item>',d,re.S)
    out=[]
    for it in items[:6]:
        t=re.search(r'<title>(.*?)</title>',it,re.S)
        de=re.search(r'<description>(.*?)</description>',it,re.S)
        t=html.unescape(re.sub('<[^>]+>','',t.group(1))) if t else ''
        de=html.unescape(re.sub('<[^>]+>','',de.group(1))) if de else ''
        out.append('- '+t+' :: '+de[:220])
    return '\n'.join(out)
for q in sys.argv[1:]:
    print('===== '+q+' ====='); print(s(q)); print()
