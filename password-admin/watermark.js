// Burn the credit into uploaded pixels. The original file stays on the designer's device.
export async function watermarkImage(file){
  const image=await createImageBitmap(file,{imageOrientation:'from-image'});
  try{
    const {width,height}=image;
    if(width*height>32000000||width>8192||height>8192)throw new Error('Для водяного знака выберите изображение до 32 мегапикселей и 8192 px по стороне.');
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d');if(!context)throw new Error('Не удалось подготовить водяной знак.');
    context.drawImage(image,0,0);
    const size=Math.max(12,Math.round(width*.023)),padding=Math.max(12,Math.round(width*.025));
    context.font=`500 ${size}px sans-serif`;context.textAlign='right';context.textBaseline='bottom';
    context.fillStyle='rgba(255,255,255,.78)';context.shadowColor='rgba(0,0,0,.85)';context.shadowBlur=Math.max(2,size*.18);
    context.fillText('Epiphany · epiphany-int.ru',width-padding,height-padding,width-padding*2);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.94));
    if(!blob||blob.size>5*1024*1024)throw new Error('Файл с водяным знаком превышает 5 МБ. Уменьшите исходное изображение.');
    return blob;
  }finally{image.close();}
}
