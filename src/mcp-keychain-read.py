#!/usr/bin/python3
"""Read only Spend Toolbox items without allowing any Keychain UI."""
import ctypes as c
import json
import os
import sys

accounts=('FEEDMOB_KEY','FEEDMOB_SECRET')
service=b'kaz-spend-toolbox.feedmob'
result={'values':{},'status':{}}
try:
    sec=c.CDLL('/System/Library/Frameworks/Security.framework/Security')
    cf=c.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
    sec.SecKeychainSetUserInteractionAllowed.argtypes=[c.c_bool]
    sec.SecKeychainSetUserInteractionAllowed.restype=c.c_int32
    sec.SecKeychainFindGenericPassword.argtypes=[c.c_void_p,c.c_uint32,c.c_char_p,c.c_uint32,c.c_char_p,c.POINTER(c.c_uint32),c.POINTER(c.c_void_p),c.POINTER(c.c_void_p)]
    sec.SecKeychainFindGenericPassword.restype=c.c_int32
    sec.SecKeychainItemFreeContent.argtypes=[c.c_void_p,c.c_void_p]
    cf.CFRelease.argtypes=[c.c_void_p]
    if sec.SecKeychainSetUserInteractionAllowed(False) != 0:
        raise RuntimeError('cannot disable Keychain UI')
    for account in accounts:
        if os.environ.get(account):
            result['status'][account]='environment'
            continue
        key=account.encode();length=c.c_uint32();data=c.c_void_p();item=c.c_void_p()
        status=sec.SecKeychainFindGenericPassword(None,len(service),service,len(key),key,c.byref(length),c.byref(data),c.byref(item))
        if status == 0:
            try:
                value=c.string_at(data,length.value).decode('utf-8')
                if value: result['values'][account]=value;result['status'][account]='keychain'
                else: result['status'][account]='empty'
            finally:
                sec.SecKeychainItemFreeContent(None,data)
                if item:cf.CFRelease(item)
        elif status == -25300: result['status'][account]='not_found'
        elif status in (-25293,-25308,-128): result['status'][account]='access_denied'
        else: result['status'][account]='unavailable'
except Exception:
    for account in accounts:
        if account not in result['status']: result['status'][account]='unavailable'
# This private pipe is captured by the launcher, never MCP stdout or a log.
json.dump(result,sys.stdout,ensure_ascii=True)
