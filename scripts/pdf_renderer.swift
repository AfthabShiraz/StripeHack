// Native macOS PDF renderer. Core Graphics embeds selectable text using system TTFs.
import Cocoa
let input = try Data(contentsOf: URL(fileURLWithPath:CommandLine.arguments[1]))
let docs = try JSONSerialization.jsonObject(with:input) as! [[String:Any]]
let ink = NSColor(calibratedRed:0.12,green:0.19,blue:0.25,alpha:1)
let accent = NSColor(calibratedRed:0.13,green:0.33,blue:0.38,alpha:1)
for d in docs {
 let receipt = d["style"] as! String == "receipt"
 let style = d["style"] as! String
 let width:CGFloat = receipt ? 300 : 595.28
 let height:CGFloat = receipt ? 900 : 841.89
 let margin:CGFloat = receipt ? 18 : 42
 let usable = width - 2*margin
 var media = CGRect(x:0,y:0,width:width,height:height)
 let ctx = CGContext(URL(fileURLWithPath:d["output"] as! String) as CFURL,mediaBox:&media,[kCGPDFContextCreator as String:"Larkspur synthetic document generator",kCGPDFContextTitle as String:d["title"]!] as CFDictionary)!
 var y:CGFloat=0; var page=0
 func font(_ size:CGFloat,_ bold:Bool=false,_ mono:Bool=false)->NSFont { NSFont(name:mono ? "CourierNewPSMT" : (bold ? "Arial-BoldMT":"ArialMT"),size:size)! }
 func attr(_ s:String,_ size:CGFloat=10,_ bold:Bool=false,_ mono:Bool=false)->NSAttributedString {
  let p=NSMutableParagraphStyle(); p.lineSpacing=3; p.lineBreakMode = .byWordWrapping
  return NSAttributedString(string:s,attributes:[.font:font(size,bold,mono),.foregroundColor:ink,.paragraphStyle:p])
 }
 func textHeight(_ s:NSAttributedString,_ w:CGFloat)->CGFloat { ceil(s.boundingRect(with:NSSize(width:w,height:10000),options:[.usesLineFragmentOrigin,.usesFontLeading]).height)+2 }
 func finish(){ NSGraphicsContext.restoreGraphicsState(); ctx.restoreGState(); ctx.endPDFPage() }
 func start(){
  page += 1; ctx.beginPDFPage(nil); ctx.saveGState(); ctx.translateBy(x:0,y:height); ctx.scaleBy(x:1,y:-1)
  NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current=NSGraphicsContext(cgContext:ctx,flipped:true)
  accent.setFill(); NSBezierPath(rect:CGRect(x:margin,y:24,width:usable,height:3)).fill()
  attr(d["brand"] as! String,receipt ? 10:12,true).draw(in:CGRect(x:margin,y:36,width:usable,height:32))
  attr("\(d["id"]!)  /  \(style.uppercased())",8).draw(in:CGRect(x:margin,y:70,width:usable,height:20))
  attr("\(d["id"]!)   •   \(page)",8).draw(in:CGRect(x:margin,y:height-30,width:usable,height:15))
  y=100
 }
 func room(_ h:CGFloat){if y+h > height-50 { finish(); start() }}
 start()
 for b in d["blocks"] as! [[String:Any]] {
  let kind=b["kind"] as! String
  if kind == "table" {
   let rows=b["rows"] as! [[String]]; let n=rows.map{$0.count}.max() ?? 1
   let weights:[CGFloat] = style == "statement" && n == 5 ? [0.12,0.12,0.40,0.18,0.18] : (style == "booklet" && n == 6 ? [0.07,0.30,0.12,0.12,0.12,0.27] : Array(repeating:1/CGFloat(n),count:n))
   let widths=weights.map{$0*usable}
   func drawRow(_ row:[String],_ header:Bool){
    let strings=row.map{attr($0, n>4 ? 8:9,header)}
    let h=max(27,(strings.enumerated().map{textHeight($0.element,widths[$0.offset]-12)}.max() ?? 20)+12)
    if header {NSColor(calibratedWhite:0.91,alpha:1).setFill(); NSBezierPath(rect:CGRect(x:margin,y:y,width:usable,height:h)).fill()}
    var x=margin
    for (j,s) in strings.enumerated(){
     NSColor(calibratedWhite:0.76,alpha:1).setStroke(); let r=CGRect(x:x,y:y,width:widths[j],height:h); let p=NSBezierPath(rect:r);p.lineWidth=0.5;p.stroke()
     s.draw(in:CGRect(x:r.minX+6,y:y+6,width:widths[j]-12,height:h-8));x += widths[j]
    };y += h
   }
   for (i,row) in rows.enumerated(){
    let h=max(27,(row.enumerated().map{textHeight(attr($0.element,n>4 ? 8:9,i==0),widths[$0.offset]-12)}.max() ?? 20)+12)
    if y+h > height-50 { finish(); start(); if i>0 { drawRow(rows[0],true) } }
    drawRow(row,i==0)
   }; y += 10
  } else {
   let s=b["text"] as! String
   let heading=kind == "heading"
   let mono=kind == "mono"
   let a=attr(s,heading ? 14 : (mono ? (receipt ? 8:8.5):10),heading,mono)
   let h=textHeight(a,usable-(style == "police" && !heading ? 16:0))
   room(h+10)
   if style == "police" && !heading {
    NSColor(calibratedWhite:0.8,alpha:1).setStroke(); NSBezierPath(rect:CGRect(x:margin,y:y,width:usable,height:h+12)).stroke()
    a.draw(in:CGRect(x:margin+8,y:y+6,width:usable-16,height:h));y += h+20
   } else {a.draw(in:CGRect(x:margin,y:y,width:usable,height:h)); y += h+(heading ? 14:7)}
  }
 }
 finish();ctx.closePDF()
}
