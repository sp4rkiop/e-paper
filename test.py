import json
import requests
from PIL import Image, ImageDraw
from io import BytesIO

# API URL
api_url = "https://epaper.prabhatkhabar.com/pagemeta/get/3783876/1-50"

# Function to create an image from chunks
def create_image_from_chunks(chunks, width, height):
    # Create a blank image with a white background
    image = Image.new('RGB', (int(width), int(height)), (255, 255, 255))
    draw = ImageDraw.Draw(image)

    for chunk in chunks:
        tx, ty, chunk_width, chunk_height, url = chunk["tx"], chunk["ty"], chunk["width"], chunk["height"], chunk["url"]
        
        # Load the chunk image from the URL
        response = requests.get(url, stream=True)
        chunk_image = Image.open(BytesIO(response.content))  # Use BytesIO to open binary content
        
        # Paste the chunk onto the main image at the specified coordinates (tx, ty)
        image.paste(chunk_image, (int(tx), int(height) - int(ty) - int(chunk_height)))  # Adjust for negative ty
        
    return image

# Make an API request to fetch data
response = requests.get(api_url)
if response.status_code == 200:
    json_data = response.json()
    
    # Loop through the parent keys in the JSON data
    for parent_key, data in json_data.items():
        chunks = data["levels"]["level2"]["chunks"]
        width = data["levels"]["level2"]["width"]
        height = data["levels"]["level2"]["height"]
        
        # Create an image from the chunks
        image = create_image_from_chunks(chunks, width, height)
        
        # Save the image to a file
        image.save(f"image_{parent_key}.jpg")

    print("Images created successfully.")
else:
    print("Failed to retrieve data from the API.")