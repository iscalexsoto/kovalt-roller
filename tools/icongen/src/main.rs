//! Genera el ícono de Windows y el PNG de la app a partir de un SVG.
//!
//! ```text
//! cargo run -p icongen -- <icono.svg> <app_icon.ico> <icono.png>
//! ```

use std::fs::File;
use std::path::Path;

use anyhow::{Context, Result, anyhow};
use resvg::{tiny_skia, usvg};

/// Tamaños habituales de Windows (barra de tareas, explorador, alt-tab, DPI altos).
const ICO_SIZES: [u32; 10] = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];
const PNG_SIZE: u32 = 512;

fn render(tree: &usvg::Tree, px: u32) -> Result<tiny_skia::Pixmap> {
    let mut pixmap = tiny_skia::Pixmap::new(px, px).ok_or_else(|| anyhow!("tamaño inválido {px}"))?;
    let size = tree.size();
    let scale = (px as f32 / size.width()).min(px as f32 / size.height());
    resvg::render(
        tree,
        tiny_skia::Transform::from_scale(scale, scale),
        &mut pixmap.as_mut(),
    );
    Ok(pixmap)
}

/// RGBA sin premultiplicar, como lo espera el formato ICO.
fn straight_rgba(pixmap: &tiny_skia::Pixmap) -> Vec<u8> {
    pixmap
        .pixels()
        .iter()
        .flat_map(|p| {
            let c = p.demultiply();
            [c.red(), c.green(), c.blue(), c.alpha()]
        })
        .collect()
}

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [svg, ico, png] = args.as_slice() else {
        return Err(anyhow!("uso: icongen <icono.svg> <app_icon.ico> <icono.png>"));
    };

    let data = std::fs::read(svg).with_context(|| format!("leyendo {svg}"))?;
    let tree = usvg::Tree::from_data(&data, &usvg::Options::default()).context("SVG inválido")?;

    let mut dir = ico::IconDir::new(ico::ResourceType::Icon);
    for px in ICO_SIZES {
        let image = ico::IconImage::from_rgba_data(px, px, straight_rgba(&render(&tree, px)?));
        dir.add_entry(ico::IconDirEntry::encode(&image)?);
    }
    dir.write(File::create(ico).with_context(|| format!("creando {ico}"))?)?;

    if let Some(parent) = Path::new(png).parent() {
        std::fs::create_dir_all(parent)?;
    }
    render(&tree, PNG_SIZE)?
        .save_png(png)
        .with_context(|| format!("guardando {png}"))?;

    println!("{ico} ({} tamaños) y {png} ({PNG_SIZE}px) generados", ICO_SIZES.len());
    Ok(())
}
