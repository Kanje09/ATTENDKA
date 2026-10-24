# Local student test images

Copy a dummy JPG into this folder. The live attendance display matches filenames to the student's account user ID.

For example, if the student's account user ID is `42`, name the file `42.jpg`:

```text
Frontend/images/students/42.jpg
```

The Admin page's **Set student photo** helper shows the filename for a user ID. When Live Server runs on port 5500, the display loads `http://localhost:5500/images/students/42.jpg`. The image is a local static file and is not uploaded or stored in the database. Files added to this folder are ignored by Git so photos are not accidentally committed. Use dummy images or images you have permission to use.
