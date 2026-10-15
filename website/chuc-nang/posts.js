(() => {
 const posts=window.QNU_POSTS || [];
 const grid=document.querySelector('#post-grid');
 if(!grid)return;
 const search=document.querySelector('#post-search');
 const year=document.querySelector('#post-year');
 const category=document.querySelector('#post-category');
 const results=document.querySelector('#post-results');
 const previous=document.querySelector('#post-prev');
 const next=document.querySelector('#post-next');
 const pageLabel=document.querySelector('#post-page');
 const size=6;
 let page=1;
 let observers=[];
 const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
 for(const y of [...new Set(posts.map(p=>p.date.slice(0,4)))].sort().reverse())year.add(new Option(y,y));
 for(const c of [...new Set(posts.map(p=>p.category))])category.add(new Option(c,c));
 document.querySelector('#post-total').textContent=posts.length;
 function render(){
  const term=normalize(search.value.trim());
  const filtered=posts.filter(p=>(!year.value||p.date.startsWith(year.value))&&(!category.value||p.category===category.value)&&normalize(p.title+' '+p.category+' '+p.date).includes(term));
  const pages=Math.max(1,Math.ceil(filtered.length/size));page=Math.min(page,pages);
  observers.forEach(observer=>observer.disconnect());observers=[];grid.replaceChildren();
  for(const post of filtered.slice((page-1)*size,page*size)){
   const card=document.createElement('article');card.className='post-card';
   const top=document.createElement('div');top.className='post-card-top';
   const meta=document.createElement('div');meta.className='post-meta';
   const tag=document.createElement('span');tag.className='post-category';tag.textContent=post.category;
   const date=document.createElement('time');date.dateTime=post.date;date.textContent=post.date.split('-').reverse().join('.');meta.append(tag,date);
   const title=document.createElement('h3');title.textContent=post.title;
   const actions=document.createElement('div');actions.className='post-actions';
   const toggle=document.createElement('button');toggle.type='button';toggle.className='post-toggle';toggle.textContent=post.video?'Xem video Facebook':'Xem bài Facebook';toggle.setAttribute('aria-expanded','false');
   const source=document.createElement('a');source.className='post-source';source.href=post.url;source.target='_blank';source.rel='noopener noreferrer';source.textContent='Mở bài gốc';
   const embed=document.createElement('div');embed.className='post-embed';embed.hidden=true;embed.id='embed-'+posts.indexOf(post);toggle.setAttribute('aria-controls',embed.id);
   toggle.addEventListener('click',()=>{
    const opening=embed.hidden;embed.hidden=!opening;toggle.setAttribute('aria-expanded',String(opening));toggle.textContent=opening?'Thu gọn':(post.video?'Xem video Facebook':'Xem bài Facebook');
    if(opening&&!embed.childElementCount){
     const width=Math.max(350,Math.min(500,Math.floor(embed.clientWidth-24)));
     const frameBox=document.createElement('div');frameBox.className='post-frame';
     const frame=document.createElement('iframe');
     frame.src='https://www.facebook.com/plugins/'+(post.video?'video':'post')+'.php?href='+encodeURIComponent(post.url)+'&show_text=true&width='+width;
     frame.title=post.title+' — Facebook';frame.loading='lazy';frame.allow='encrypted-media; picture-in-picture; web-share';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';
     const note=document.createElement('p');note.textContent='Nếu Facebook không hiển thị bài nhúng, chọn “Mở bài gốc” ở trên. Nội dung và hình ảnh do fanpage cung cấp.';frameBox.append(frame);embed.append(frameBox,note);
     // Facebook's fixed embed canvas is scaled to fit narrow screens.
     const fit=()=>{const available=frameBox.clientWidth;if(!available)return;const scale=Math.min(1,available/width);frame.style.width=width+'px';frame.style.height='850px';frame.style.transform=`scale(${scale})`;frame.style.transformOrigin='top left';frameBox.style.height=(850*scale)+'px';};
     fit();const observer=new ResizeObserver(fit);observer.observe(frameBox);observers.push(observer);
    }
   });
   actions.append(toggle,source);top.append(meta,title,actions);card.append(top,embed);grid.append(card);
  }
  if(!filtered.length){const empty=document.createElement('p');empty.className='post-empty';empty.textContent='Chưa có bài phù hợp. Hãy thử từ khóa khác hoặc chọn tất cả năm, chương trình.';grid.append(empty);}
  results.textContent=filtered.length?`${filtered.length} bài phù hợp · Đang xem ${(page-1)*size+1}–${Math.min(page*size,filtered.length)} · Mới nhất trước`:'Không tìm thấy bài viết';
  pageLabel.textContent=`${page} / ${pages}`;previous.disabled=page===1;next.disabled=page===pages;
 }
 function changeFilter(){page=1;render();}
 search.addEventListener('input',changeFilter);year.addEventListener('change',changeFilter);category.addEventListener('change',changeFilter);
 previous.addEventListener('click',()=>{page--;render();results.scrollIntoView({block:'center'});});
 next.addEventListener('click',()=>{page++;render();results.scrollIntoView({block:'center'});});
 render();
})();
