import argparse
import datetime
import re
import requests
from io import BytesIO
from PIL import Image
import img2pdf

EDITION_URL = "https://epaper.livehindustan.com/edition/{slug}?date={date}&page=1"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    )
}
MAX_EDGE = 1800
JPEG_QUALITY = 80

def fetch_page_urls(date):
    """Fetch the edition page and extract all high-res page image URLs."""
    try:
        response = requests.get(
            EDITION_URL.format(slug="dhanbad", date=date),
            headers=HEADERS,
            timeout=60,
        )
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"Error fetching edition page: {e}")
        return []

    urls = sorted(
        set(re.findall(r"https://epaper\.livehindustan\.com/ep-img/prod/lh-epaper/\d{4}/\d{2}/\d{2}/pages/[^\"'?]+_hr\.webp", response.text))
    )
    return urls

def download_image(image_url):
    """Download an image from a URL and return it as BytesIO."""
    try:
        response = requests.get(image_url, headers=HEADERS, timeout=60)
        response.raise_for_status()
        return BytesIO(response.content)
    except requests.RequestException as e:
        print(f"Error downloading image: {e}")
        return None

def to_jpeg(webp_data, max_edge=MAX_EDGE, quality=JPEG_QUALITY):
    """Re-encode a WebP image to a compact JPEG buffer."""
    try:
        with Image.open(webp_data) as img:
            img = img.convert("RGB")
            if img.width > img.height and img.width > max_edge:
                img = img.resize((max_edge, round(img.height * max_edge / img.width)), Image.Resampling.LANCZOS)
            elif img.height > max_edge:
                img = img.resize((round(img.width * max_edge / img.height), max_edge), Image.Resampling.LANCZOS)
        buf = BytesIO()
        img.save(buf, "JPEG", quality=quality, optimize=True)
        buf.seek(0)
        return buf
    except Exception as e:
        print(f"Error re-encoding image: {e}")
        return None

def create_pdf(image_data, pdf_filename):
    """Create a PDF from the given image data."""
    try:
        with open(pdf_filename, "wb") as pdf_file:
            pdf_file.write(img2pdf.convert(image_data))
        print(f"PDF created: {pdf_filename}")
    except Exception as e:
        print(f"Error creating PDF: {e}")

def main():
    """Main function to fetch data, download images, and create PDFs."""
    parser = argparse.ArgumentParser()
    parser.add_argument("date", nargs="?", default=datetime.date.today().strftime("%Y-%m-%d"))
    parser.add_argument("--full", action="store_true", help="also produce a lossless full-resolution PDF")
    args = parser.parse_args()

    page_urls = fetch_page_urls(args.date)

    if not page_urls:
        print("No page images found.")
        return

    print(f"Found {len(page_urls)} pages for {args.date}")

    compact_data = []
    full_data = []
    for url in page_urls:
        image = download_image(url)
        if not image:
            print(f"Skipping page: {url}")
            continue
        if args.full:
            full_data.append(BytesIO(image.getvalue()))
        compact = to_jpeg(image)
        if compact:
            compact_data.append(compact)

    if compact_data:
        create_pdf(compact_data, "Hindustan-Dhanbad.pdf")

    if full_data:
        create_pdf(full_data, "Hindustan-Dhanbad-Full.pdf")

if __name__ == "__main__":
    main()
