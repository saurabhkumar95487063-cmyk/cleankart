import os
from PIL import Image, ImageDraw

# Paths
img_path = r"c:\Users\Lenovo\OneDrive\Desktop\laundry\public\images\cleankart_logo.png"
output_path = r"c:\Users\Lenovo\OneDrive\Desktop\laundry\public\images\cleankart_logo_round.png"

# Open image
img = Image.open(img_path).convert("RGBA")
width, height = img.size

# Crop to square center if not square
min_dim = min(width, height)
left = (width - min_dim) // 2
top = (height - min_dim) // 2
right = left + min_dim
bottom = top + min_dim
img = img.crop((left, top, right, bottom))
width, height = img.size

# Create circular mask
mask = Image.new('L', (width, height), 0)
draw = ImageDraw.Draw(mask)
draw.ellipse((0, 0, width, height), fill=255)

# Apply mask
output = Image.new('RGBA', (width, height), (0, 0, 0, 0))
output.paste(img, (0, 0), mask)

# Save image
output.save(output_path)
print(f"Saved round logo to {output_path}")
