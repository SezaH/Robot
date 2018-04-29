import cv2

camera = cv2.VideoCapture(1)
return_value, image = camera.read()
cv2.imwrite('image.jpg', image)