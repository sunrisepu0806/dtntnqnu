"use client";
import { useMapEvents } from "react-leaflet";
export default function LocationPicker({ onSelectLocation }: { onSelectLocation: (lat:number,lng:number)=>void }) {
  useMapEvents({ click(event) { onSelectLocation(event.latlng.lat,event.latlng.lng); } });
  return null;
}
