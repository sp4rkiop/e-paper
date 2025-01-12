import datetime
import requests
from io import BytesIO
import img2pdf

def fetch_api_data(api_url):
    """Fetch JSON data from the API."""
    try:
        response = requests.get(api_url)
        response.raise_for_status()  # Raise an error for bad responses
        page_height = response.json()[0].get("PageHeight")
        page_width = response.json()[0].get("PageWidth")
        return response.json(), page_height, page_width
    except requests.RequestException as e:
        print(f"Error fetching API data: {e}")
        return None, None, None

def download_image(image_url):
    """Download an image from a URL and return it as BytesIO."""
    try:
        response = requests.get(image_url)
        response.raise_for_status()  # Raise an error for bad responses
        return BytesIO(response.content)
    except requests.RequestException as e:
        print(f"Error downloading image: {e}")
        return None

def create_pdf(image_data, page_width, page_height, pdf_filename):
    """Create a PDF from the given image data."""
    try:
        with open(pdf_filename, "wb") as pdf_file:
            pdf_file.write(img2pdf.convert(image_data, layout_fun=img2pdf.get_layout_fun((page_width, page_height))))
        print(f"PDF created: {pdf_filename}")
    except Exception as e:
        print(f"Error creating PDF: {e}")

def main():
    """Main function to fetch data, download images, and create a PDF."""
    today = datetime.date.today()
    api_url = f"https://epaper.livehindustan.com/Home/GetAllpages?editionid=1010&editiondate={today.strftime('%d/%m/%Y')}"

    api_data, page_height, page_width = fetch_api_data(api_url)
    
    if not api_data:
        print("No data fetched from API.")
        return

    image_data = []
    for item in api_data:
        img_base_url = item.get("XHighResolution")[:item.get("XHighResolution").rfind("/")+1]
        image_name = item.get("FileName")[:item.get("FileName").rfind(".")]
        img_final_url = f"{img_base_url}{image_name}.jpg"
        
        if img_final_url:
            image = download_image(img_final_url)
            if image:
                image_data.append(image)

    if not image_data:
        print("No images downloaded to create a PDF.")
        return

    pdf_filename = "Hindustan-Dhanbad.pdf"
    create_pdf(image_data, page_width, page_height, pdf_filename)

if __name__ == "__main__":
    main()