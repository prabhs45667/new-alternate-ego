import sys
import json
import time

def scrape(url, name):
    from playwright.sync_api import sync_playwright
    from playwright_stealth import stealth
    
    parts = [f"LinkedIn Profile: {name}"]
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()
        stealth(page)
        
        page.goto(url, timeout=20000, wait_until="domcontentloaded")
        time.sleep(2)
        
        ld_json_els = page.query_selector_all('script[type="application/ld+json"]')
        for el in ld_json_els:
            try:
                data = json.loads(el.inner_text())
                if isinstance(data, dict):
                    if data.get("@type") == "Person" or "name" in data:
                        if data.get("name"): parts.append(f"Name: {data['name']}")
                        if data.get("jobTitle"): parts.append(f"Job Title: {data['jobTitle']}")
                        if data.get("worksFor"):
                            company = data["worksFor"]
                            if isinstance(company, dict): parts.append(f"Company: {company.get('name', '')}")
                            elif isinstance(company, str): parts.append(f"Company: {company}")
                        if data.get("alumniOf"):
                            edu = data["alumniOf"]
                            if isinstance(edu, dict): parts.append(f"Education: {edu.get('name', '')}")
                            elif isinstance(edu, list):
                                for e in edu:
                                    if isinstance(e, dict): parts.append(f"Education: {e.get('name', '')}")
                        if data.get("address"):
                            addr = data["address"]
                            if isinstance(addr, dict): parts.append(f"Location: {addr.get('addressLocality', '')}")
                        if data.get("description"): parts.append(f"About: {data['description']}")
            except: pass
            
        for meta_prop in ['og:title', 'og:description']:
            el = page.query_selector(f'meta[property="{meta_prop}"]')
            if el:
                content = el.get_attribute('content')
                if content and content not in str(parts): parts.append(content)
        
        meta_desc = page.query_selector('meta[name="description"]')
        if meta_desc:
            content = meta_desc.get_attribute('content')
            if content and len(content) > 50 and content not in str(parts): parts.append(f"Profile: {content}")
        
        body_text = page.inner_text('body')
        if body_text:
            lines = [l.strip() for l in body_text.split('\n') if l.strip() and len(l.strip()) > 15]
            noise = ['sign in', 'sign up', 'join now', 'forgot password', 'cookie', 'privacy']
            clean = [l for l in lines if not any(n in l.lower() for n in noise)]
            if clean: parts.append("Content:\n" + "\n".join(clean[:40]))
        
        browser.close()
    
    return "\n\n".join(parts)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(1)
    url = sys.argv[1]
    name = sys.argv[2] if len(sys.argv) > 2 else ""
    try:
        print(scrape(url, name))
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
