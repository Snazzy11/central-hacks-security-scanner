# from pathlib import Path
# import pandas as pd
# import filetype
# import pdfplumber
# from docx import Document
# from datetime import datetime
# from dataclasses import dataclass
# import pymupdf

# BASE_DIR = Path(__file__).resolve().parent  # goes up from app/ to project/

# # Test file paths
# test_file_path = BASE_DIR / "db" / "1english_openpii_30k.jsonl";
# pdf_file_path = BASE_DIR / "db" / "example.pdf"
# text_file_path = BASE_DIR / "db" / "example.txt"
# md_file_path = BASE_DIR / "db" / "example.md"
# docx_file_path = BASE_DIR / "db" / "example.docx"

# def detect_type(path: Path) -> str:
#     kind = filetype.guess(str(path))
#     if kind is not None:
#         return kind.extension          # binary formats: pdf, png, zip, docx...
#     return path.suffix.lstrip(".").lower()  # text formats: jsonl, json, csv, txt

# def scrapeText(file_path, type_of_file) -> str: 
#     match type_of_file:
#         case "pdf":
#             pdf_data = ""
#             with pdfplumber.open(file_path) as fp:
#                 for page in fp.pages:
#                     pdf_data += page.extract_text()
#             return pdf_data.strip()
            
#         # supported file types
#         case "doc":
#             document_data = Document(file_path)
#             result = ""
#             for doc_para in document_data.paragraphs:
#                 result += doc_para.text
#             return result.strip()
        
#         case "docx":
#             document_data = Document(file_path)
#             result = ""
#             for doc_para in document_data.paragraphs:
#                 result += doc_para.text
#             return result.strip()
        
#         case "txt":
#             text = open(file_path)
#             return text.read().strip()
        
#         case "md":
#             with open(file_path, "r") as fp:
#                 return (fp.read()).strip()
            
#         # # testing
#         case "jsonl":
#             json_obj = pd.read_json(path_or_buf=file_path, lines=True)

#             test_1 = json_obj['source_text'][0]
#             test_2 = json_obj['source_text'][1]
#             test_3 = json_obj['source_text'][2]
#             test_4 = json_obj['source_text'][3]
#             test_5 = json_obj['source_text'][4]
#             test_6 = json_obj['source_text'][5]
#             test_7 = json_obj['source_text'][6]
#             test_8 = json_obj['source_text'][7]
#             test_9 = json_obj['source_text'][8]
#             test_10 = json_obj['source_text'][9]
            
#             return test_1.strip()
        

# # file = open(test_file_path)
# # file = open(pdf_file_path) # TODO: gets file from api endpoint    
# type_of_file = detect_type(pdf_file_path)

# # scrapes text from file depending on the extension type
# # print(scrapeText(pdf_file_path, type_of_file))

# # a way of writing to a pdf, 
# # a = pymupdf.open(pdf_file_path)
# # page = a[0]
# # page.insert_text(
# #     pymupdf.Point(100, 130),
# #     "Hello world",
# #     fontsize=12,
# #     fontname="helv",
# #     color=(0,0,0)
# # )

# # a.save(pdf_file_path, incremental=True, encryption=pymupdf.PDF_ENCRYPT_KEEP)
