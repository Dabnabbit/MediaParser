import os, re, datetime, time, shutil
from typing import Optional
import exiftool # PyExifTool

#import piexif
from PIL import Image #  pillow
#import exifread

# import logging
# logging.basicConfig(level=logging.DEBUG)


documents_dir = 'D:/Work/Scripts/PhotoTimeFixer/Test/'
output_dir = 'Output/'
output_dir_years = True
output_dir_clear = True

valid_extensions    = ('jpg', 'jpeg', 'png', 'gif', 'mp4', 'mpeg', 'mov')#, 'avi')
valid_date_year_min = 2000
valid_date_year_max = 2100
valid_date_regex    = r'(19|20)\d{2}[-_.]?(0[1-9]|1[0-2])[-_.]?([0-2][0-9]|3[0-1])'
valid_time_regex    = r'([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]'
valid_timezone_regex = r'[-+]([01][0-9]|2[0-3]):?[0-5][0-9]'
valid_metatag_regex = r'\{.*\}'
meta_filetype_tags  = ('File:FileType', 'File:FileTypeExtension', 'File:MIMEType')
meta_datetime_tags  = ('File:FileModifyDate', 'File:FileCreateDate', 'EXIF:DateTimeOriginal', 'EXIF:ModifyDate')
meta_ignored_tags   = ('SourceFile', 'File:FileName', 'File:FileAccessDate', 'ICC_Profile:ProfileDateTime', 'IPTC:SpecialInstructions', 'Photoshop:*',)
meta_ensured_tags   = ('DateTimeOriginal', 'FileCreateDate')
# meta_comment_tags   = ('EXIF:XPKeywords' ,'XMP:Subject')
meta_comment_tags   = ['EXIF:XPKeywords']
# meta_datetime_tags = ('File:FileModifyDate', 'File:FileAccessDate', 'File:FileCreateDate', 'EXIF:DateTimeOriginal', 'EXIF:ModifyDate')
# meta_datetime_tags = ('File:FileModifyDate', 'File:FileCreateDate', 'EXIF:DateTimeOriginal', 'EXIF:ModifyDate', 'QuickTime:CreateDate')

class bcolors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

# exif_set_method = 1
startTime = 0

def Main():
    output_path_base = os.path.join(documents_dir, output_dir)
    if os.path.exists(output_path_base) and output_dir_clear == True:
        shutil.rmtree(output_path_base)
    directory_list = ['']
    for directory_name in os.listdir(documents_dir):
        directory_path = os.path.join(documents_dir, directory_name)
        if os.path.isdir(directory_path) and directory_name != output_dir:
            directory_list.append(directory_name)
    print(directory_list)

    # with exiftool.ExifToolHelper(logger=logging.getLogger(__name__)) as et:
    with exiftool.ExifToolHelper() as et:

        check_these_files = []
        meta_error_files = []
        for directory_name in directory_list:
            directory_path = os.path.join(documents_dir, directory_name)
            for document_name in os.listdir(directory_path):
                document_path = os.path.join(directory_path, document_name)
                if not os.path.isfile(document_path) or not document_path.lower().endswith(valid_extensions):
                    continue
                document_tags = []
                if directory_path != documents_dir:
                    document_tags.append(directory_name)
                if '{' in document_name:
                    tag_check = re.search(valid_metatag_regex, document_name)
                    if tag_check:
                        tag_list = tag_check.group(0)[1:-1].split(',')
                        document_tags.extend(tag_list)
                        # print('tags: ', str(tag_list))
                # print(f'{bcolors.OKBLUE}{(time.time() - startTime):.2f}s:\tScanning {bcolors.OKCYAN}{directory_name + '/' + document_name}{bcolors.ENDC}')
                # print('Tags: ' + str(document_tags) + ' | ' + document_name)
                document_extension = document_path.lower().split('.')[-1]
                document_datetime = get_datetime_from_name(document_name)
                output_datetime = document_datetime
                metadata = et.get_metadata(document_path)[0]
                # print(metadata)
                print(f'{bcolors.OKBLUE}{(time.time() - startTime):.2f}s:\tScanning {bcolors.OKCYAN}{directory_name + '/' + document_name} {bcolors.OKBLUE}{metadata['Composite:Megapixels']:.2f} megapixels {bcolors.ENDC}')

                # if document_name.startswith('{Korea}'):
                #     print('----------------Metadata 1----------------')
                #     print(metadata)
                #     print('----------------Metadata 2----------------')
                #     exif_dict = piexif.load(document_path)
                #     print(exif_dict)
                #     print('----------------Metadata 3----------------')
                #     pil_img = Image.open(document_path)
                #     exif_info = pil_img.getexif()
                #     print(exif_info)
                #     print('----------------Metadata 4----------------')
                #     er_img = open(document_path, 'rb')
                #     exif_tags = exifread.process_file(er_img)
                #     print(exif_tags)

                meta_datetimes1 = []
                meta_datetimes2 = []
                if document_datetime != False:
                    meta_datetimes2.append(document_datetime)
                meta_filetypes = []

                for filetype_key in meta_filetype_tags:
                    if filetype_key in metadata.keys():
                        found_filetype = metadata[filetype_key].lower()
                        if '/' in found_filetype:
                            found_filetype = found_filetype.split('/')[1]
                        if 'jpeg' in found_filetype:
                            found_filetype = found_filetype.replace('jpeg', 'jpg')
                        meta_filetypes.append(found_filetype)

                if document_datetime != False and '[FORCE]' in document_name:
                    meta_datetimes1.clear()
                    meta_datetimes2.clear()
                    meta_datetimes1.append(document_datetime)
                else:
                    for key in metadata.keys():
                        if type(metadata[key]) is not str:
                            continue
                        if key in meta_datetime_tags:
                            found_datetime = convert_str_to_datetime(metadata[key])
                            if found_datetime != False:
                                meta_datetimes1.append(found_datetime)
                        elif(key not in meta_ignored_tags and document_name.lower() not in str(metadata[key]).lower() and re.search(valid_date_regex, str(metadata[key]).replace(':',''))):
                            # print('hmm0 ' + str(metadata[key]) + ' : ' + key)
                            found_datetime = convert_str_to_datetime(str(metadata[key]).replace(':',''))
                            if found_datetime != False:
                                meta_datetimes2.append(found_datetime)
                                # print("Other timestamp: " + key + ' : ' + str(found_datetime))

                if len(meta_datetimes1 + meta_datetimes2) < 1:
                    print(metadata)
                # print('Meta Datetimes: ' + str(meta_datetimes1 + meta_datetimes2))
                # print('Found min: ' + str(min(meta_datetimes1 + meta_datetimes2)) + ' | max: ' + str(max(meta_datetimes1 + meta_datetimes2)))
                # print('Found variance: ' + str(max(meta_datetimes1 + meta_datetimes2) - min(meta_datetimes1 + meta_datetimes2)))
                # print('Len of meta_datetimes: ' + str(len(meta_datetimes1)))

                # meta_datetimes_count = len(meta_datetimes1 + meta_datetimes2)
                meta_datetimes_count = len(meta_datetimes2)
                output_datetime = min(meta_datetimes1 + meta_datetimes2)
                # output_datetime = min(meta_datetimes)
                output_document_extension = document_extension
                if document_extension not in meta_filetypes:
                    print(f'{bcolors.OKBLUE}{(time.time() - startTime):.2f}s:\t{directory_name + '/' + document_name}\t {bcolors.WARNING}Extension Metadata mismatch found, correcting output filetype...{bcolors.ENDC}')
                    output_document_extension = meta_filetypes[0]

                output_document_name = str(output_datetime)[:-6].replace('-','').replace(':','').replace(' ','_') + '.' + output_document_extension
                # output_document_name = str(output_datetime)[:-6].replace('-','').replace(':','').replace(' ','_') + '-' + str(meta_datetimes_count) + '.' + output_document_extension
                output_path = output_path_base
                if meta_datetimes_count < 1 and '[FORCE]' not in document_name:
                    # check_these_files.append(document_name)
                    check_these_files.append(document_name + "\t->\t" + output_document_name)
                    output_path = os.path.join(output_path_base, 'CHECK')
                    if not os.path.exists(output_path):
                        os.makedirs(output_path)
                elif output_dir_years == True:
                    output_path = os.path.join(output_path_base, str(output_datetime.year))
                    if not os.path.exists(output_path):
                        os.makedirs(output_path)
                output_document_path = os.path.join(output_path, output_document_name)

                while os.path.isfile(output_document_path):
                    print(f'{bcolors.OKBLUE}{(time.time() - startTime):.2f}s:\t{output_document_name}\t {bcolors.WARNING}Filename already exists, incrementing 1 second...{bcolors.ENDC}')
                    output_datetime = output_datetime + datetime.timedelta(0, 1)
                    output_document_name = str(output_datetime)[:-6].replace('-','').replace(':','').replace(' ','_') + '.' + output_document_extension
                    output_document_path = os.path.join(output_path, output_document_name)

                shutil.copy2(document_path, output_document_path)
                datetime_meta_format = str(output_datetime).replace('-', ':', 2)
                metadata = et.get_metadata(output_document_path)[0]

                metadata_to_update = {}
                for key in metadata.keys():
                    if key not in meta_ignored_tags and 'date' in key.lower() and re.search(valid_date_regex, str(metadata[key]).replace(':','')):
                        if 'QuickTime' not in key:
                            metadata_to_update[key] = datetime_meta_format
                for key in meta_ensured_tags:
                    if key not in metadata_to_update.keys():
                        metadata_to_update[key] = datetime_meta_format
                for key in meta_comment_tags:
                    if key not in metadata_to_update.keys():
                        # print('Key: ' + key + ' | Tags: ' + str(document_tags), ' | Joined: ' + ';'.join(document_tags))
                        metadata_to_update[key] = ';'.join(document_tags)
                # print("Updating: " + str(metadata_to_update))
                if meta_datetimes_count > 0:
                    # 
                    # et.set_tags(output_document_path, tags=metadata_to_update, params=['-overwrite_original'])
                    # print(metadata_to_update)
                    try:
                        et.set_tags(output_document_path, tags=metadata_to_update, params=['-overwrite_original'])
                    except Exception as e:
                        exception_type = type(e).__name__
                        if exception_type == "ExifToolExecuteError":
                            # input("ExifToolExecuteError: Press Enter to continue...")
                            meta_error_files.append(document_name + '\t->\t/' + output_dir + 'ERROR/' + output_document_name + '\t (' + exception_type + ')')
                            output_path = os.path.join(output_path_base, 'ERROR')
                            if not os.path.exists(output_path):
                                os.makedirs(output_path)
                            shutil.move(output_document_path, os.path.join(output_path, output_document_name))

                print(f'{bcolors.OKBLUE}{(time.time() - startTime):.2f}s:\tSaving {bcolors.OKCYAN}{directory_name + '/' + document_name}{bcolors.OKBLUE} as {bcolors.OKGREEN}{output_dir+output_document_name}{bcolors.ENDC}')
    if len(check_these_files) > 0:
        print(f'{bcolors.WARNING}Low confidence found, check the following:{bcolors.ENDC}')
        # print('Check the following:')
        for check_this_file in check_these_files:
            print(check_this_file)
    if len(meta_error_files) > 0:
        print(f'{bcolors.FAIL}MetaData Errors found, check the following:{bcolors.ENDC}')
        # print('MetaData Errors in the following:')
        for meta_error_file in meta_error_files:
            meta_error = meta_error_file.split('\t')
            print(meta_error_file)
            print(f'{bcolors.OKCYAN}{meta_error[0]}\t{bcolors.OKBLUE}{meta_error[1]}\t{bcolors.OKGREEN}{meta_error[2]}\t{bcolors.FAIL}{meta_error[3]}{bcolors.ENDC}')
            # print(f'{bcolors.OKCYAN}{0}{bcolors.WARNING}{1}{bcolors.FAIL}{2}{bcolors.ENDC}'.format(meta_error))

#//-Try to scan the document for dates, and compare to any date found in filename, else pull the latest date in contents
def get_datetime_from_name(document_name: str) -> Optional[datetime.datetime]:
    date_check = re.search(valid_date_regex, document_name)
    if date_check != None:
        found_date = date_check.group(0)
        found_time = '235900'
        time_check = re.search(valid_time_regex, document_name[date_check.span()[1]:])
        if time_check:
            found_time = time_check.group(0)
        found_datetime = convert_str_to_datetime(found_date + ' ' + found_time)
        return found_datetime
    return None

#//-Parse and convert date-time strings into datetime objects and handle input validation/error handling etc...
def convert_str_to_datetime(input_string: str) -> Optional[datetime.datetime]:
    if type(input_string) != str:
        return None
    stripped = input_string.replace(':','')
    # print("hmm1 " + stripped + ' | ' + valid_date_regex)
    datetime_check = re.search(valid_date_regex, stripped)
    if datetime_check:
        datetime_string = stripped[datetime_check.span()[0]:]
        timezone_hours = -4
        timezone_minutes = 0
        # print("hmm2 " + datetime_string[8:] + ' | ' + valid_time_regex + valid_timezone_regex)
        if re.search(valid_time_regex + valid_timezone_regex, datetime_string[8:]):
            timezone_offset = datetime_string[-5:]
            timezone_sign = -1
            if timezone_offset[0] == '+':
                timezone_sign = 1
            timezone_hours = int(timezone_offset[1:3]) * timezone_sign
            timezone_minutes = int(timezone_offset[3:]) * timezone_sign
            # print("has a timezone?! " + datetime_string + ' | ' + )

        timezone_tz = datetime.timezone(datetime.timedelta(hours=timezone_hours, minutes=timezone_minutes))
        stripped = datetime_string.replace('-','').replace('.','').replace('_','')
        # print("hmm1 " + stripped)
        year = int(stripped[:4])
        if year < valid_date_year_min or year > valid_date_year_max:
            return None
        if len(stripped) < 9:
            stripped += ' 23'
        elif stripped[8:9] != ' ':
            stripped = stripped[:8] + ' ' + stripped[8:]
        while len(stripped) < 15:
            stripped += '0'
        # print("hmm3 " + stripped + ' | ' + valid_date_regex + r' ' + valid_time_regex, stripped)
        if re.search(valid_date_regex + r' ' + valid_time_regex, stripped):
            # print("Stripped: ", stripped)
            # print(stripped[:4], stripped[4:6], stripped[6:8], stripped[9:11], stripped[11:13], stripped[13:15])
            parsed_datetime = datetime.datetime(int(stripped[:4]), int(stripped[4:6]), int(stripped[6:8]), int(stripped[9:11]), int(stripped[11:13]), int(stripped[13:15]), 0, timezone_tz)
            # print(str(parsed_datetime))
            return parsed_datetime
        return None
    return None
if __name__ == '__main__':
    startTime = time.time()
    Main()