import datetime
import requests
import img2pdf
from io import BytesIO

# Define the API URL
today = datetime.date.today()
api_url = "https://epaper.livehindustan.com/Home/GetAllpages?editionid=1010&editiondate="+today.strftime("%d/%m/%Y")
page_height=None
page_width=None
# Define a function to fetch JSON data from the API
def fetch_api_data(url):
    response = requests.get(url)
    global page_height,page_width
    if response.status_code == 200:
        page_height = response.json()[0].get("PageHeight")
        page_width = response.json()[0].get("PageWidth")
        return response.json()
    return None

# Define a function to download an image from a URL
def download_image(url):
    response = requests.get(url)
    if response.status_code == 200:
        return BytesIO(response.content)
    return None

# Fetch the JSON data from the API
api_data = fetch_api_data(api_url)

# Create a list to store image data
image_data = []

if api_data and isinstance(api_data, list):
    for item in api_data:
        # img_url = item.get("XHighResolution")
        img_base_url = item.get("XHighResolution")[:item.get("XHighResolution").rfind("/")+1]
        image_name = item.get("FileName")[:item.get("FileName").rfind(".")]
        img_final_url = img_base_url + image_name + ".jpg"
        if img_final_url:
            image = download_image(img_final_url)
            if image:
                image_data.append(image)

# Create a PDF using img2pdf
pdf_filename = "Hindustan-Dhanbad.pdf"

if image_data:
    with open(pdf_filename, "wb") as pdf_file:
        pdf_file.write(img2pdf.convert(image_data, layout_fun=img2pdf.get_layout_fun((page_width, page_height))))

    print(f"PDF created: {pdf_filename}")
else:
    print("No image data to create a PDF.")