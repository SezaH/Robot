import cv2
import argparse

parser = argparse.ArgumentParser(description='Captures an image from a webcam and saves it.')
parser.add_argument('output', default='image.jpg',
                   help='Name of the file to save the image as')
parser.add_argument('cameraNum', type=int, default=0,
                   help='sum the integers (default: find the max)')

args = parser.parse_args()
print(args)
camera = cv2.VideoCapture(args.cameraNum)
return_value, image = camera.read()
cv2.imwrite(args.output, image)